---
title: AWS Lambda와 Actor model
tags: ["aws", "serverless", "lambda", "actor"]
---

천성이 백엔드 개발자라서 그런지 개인적으로 토이 프로젝트를 해도 꼭 서버가 들어가는 경우가 더 많다. 이런 시스템들을 단순히 코드 형태로 GitHub에만 보관하는 것은 아무래도 좀 아쉬워서 혹시 생각날 때 바로 접속해볼 수 있게 늘 띄워놓고 싶은데 아무래도 비용이 만만치 않다. Docker로 구워두고 필요할 때마다 `compose up`해서 사용할 수도 있겠지만 역시 이를 위한 환경이 필요하다는 점에서 아쉽다.

이런 이유로 서버리스에 빠지게 되었고, 이제는 거의 대부분의 프로젝트를 서버리스로 진행하고 있다. 대부분의 경우에는 한 달에 한 번이나 요청이 있을까 말까 하기 때문에 서버리스로 배포된 프로젝트는 요금 최적화 측면에서 굉장히 흡족하다. 사실상 요금이 없기 때문이다.

하지만 이러한 서비스들에서 만약 state를 관리해야 할 일이 생긴다면 좀 곤란해진다. 왜냐하면 DynamoDB는 RCU/WCU를 관리해야 하는데 예측하기 어렵거나 비용이 생각보다 너무 나오고, MySQL이나 Redis는 dedicated instance를 띄워놓아야 하기 때문에 비용이 너무 많이 나오기 때문이다. 이에 비해 S3는 꽤 괜찮은 선택지처럼 보인다. Lambda에서 S3로부터 파일을 읽어서 적당히 수정해서 다시 S3에 쓰는 것이다. 어차피 요청이 거의 없을 것이기 때문에 S3 request 수도 별로 없을 것이므로 요금도 사실상 거의 안 나올 것이다.

하지만 가장 큰 문제는 concurrent update다. 예를 들어 게임 내에서 유저의 상태를 변경하는 API가 거의 동시에 요청되어 그걸 처리하기 위한 Lambda instance가 동시에 실행되었다면, 그 둘 모두 S3에서 파일을 가져와서 수정하고 업데이트하는 작업을 _동시에_ 수행하게 될 것이다. 즉, 운이 나쁘면, 한 Lambda instance에서 작업한 내용은 다른 Lambda instance의 덮어쓰기에 의해 완전히 소실될 것이다.

이를 해결하기 위해 여러 적절한 방법들이 있을지 모르겠지만, 이 글에서는 개인적으로 좋아하는 [Actor model](https://en.wikipedia.org/wiki/Actor_model)을 사용하여 문제를 해결해보고자 한다.

### Actor model

[예전에도 다룬 적](https://lacti.github.io/2011/08/11/synchronize-function-execution-in-each-object/)이 있는데, Actor model의 가장 큰 장점은, actor 내에서 처리되는 메시지의 동시 실행을 막을 수 있다는 것이다. 이를 위해 간단히

- 각 actor마다 queue를 가지고 있고,
- 어떤 actor에게 처리를 요청할 때에는 그 정보를 message에 담아 queue로 보내고,
- actor를 담당하는 thread가 queue에 message가 도착하면 그걸 처리한다.

actor를 담당하는 thread가 있기 때문에 한 actor를 여러 thread가 접근하지 않아 actor 내 상태의 동시 수정 문제를 막을 수 있다. 그리고 이 때 thread를 효율적으로 사용하기 위해 다음과 같은 구조를 사용할 수 있다.

- actor의 `messageCount`를 `atomicInc`한다.
- 이 때 결과가 1이 아니라면 다른 thread가 처리를 하고 있다는 것이므로 message만 enqueue하고 나간다.
- 만약 결과가 1이라면 이 actor에 첫 message를 넣은 것이므로 책임지고 처리를 시작한다. 일단 가져온 message를 queue에 enqueue한다.
- queue가 empty될 때까지 dequeue해서 처리한다. 그리고 이 때의 개수를 X라고 해보자. 이제 `compareAndSwap`으로 `messageCount`가 `X`면 `0`으로 바꿔보자.
  - 성공했다면 처리하는 동안에 아무도 message를 넣지 않은 것이므로 actor를 다른 thread가 필요할 때 처리해줄 수 있도록 놔준다.
  - 실패했다면 그 사이 누군가 queue에 message를 넣었다는 것이다. `messageCount`에서 `X`만큼 `atomicDec`를 해주고 다시 queue를 처리하러 간다.

이제 message를 actor에 넣는 순간 thread가 할당되어 그 actor로 전달되는 message를 소진할 때까지 처리하는 구조가 된다. 이는 actor마다 thread를 가지고 계속 queue를 polling하거나 blocking wait을 하는 것보다 좀 더 효율적인 시스템을 구성할 수 있게 된다. 게다가 준비물도 `atomicInc`, `atomicDec`, `compareAndSwap`와 `ConcurrentQueue`나 `ConcurrentStack` 정도로 매우 간단하므로 쉽게 구축할 수 있다.

### [분산 Actor model](https://github.com/yingyeothon/nodejs-toolkit/tree/master/packages/actor-system)

그럼 만약 이걸 분산으로 만든다면 어떻게 될까? 간단히 모든 준비물이 분산 환경을 지원하면 되겠다. 즉,

- `atomic` `+`, `-` 그리고 `CAS`를 지원하고, `concurrent` `queue`나 `stack` 자료구조를 지원하는 저장소와,
- 이 저장소로 적절히 `message`를 `serialize` `deserialize`하며 주고 받기 좋은 언어 런타임이 있으면 되겠다.

이를 위해,

- `MySQL` 같은 RDBMS에 `transaction`과 `stored procedure`를 사용하여 위 연산을 모두 만들어볼 수도 있고,
- `CAS`가 조금 아쉽기는 하지만 그래도 쓸만한 `Redis`를 사용해볼 수도 있고,
- 아니면 위 연산을 지원하는 싸고 튼튼하고 효율 좋은 시스템을 직접 구축해볼 수도 있겠다.

물론 이는 단순히 위에서 이야기한 actor간 message 교환과 효율적 처리만을 위한 구조이므로, 에러 처리나 요청 추적, actor 다중화 등을 고려하면 좀 더 고민해야 할 것이 많다. 하지만 이 글에서는 ~~조금은 부족하지만~~ `Redis`를 사용하여 AWS Lambda에 올리기 좋은 분산 Actor model을 만들어볼 것이다.

### [Redis를 사용한 Actor model](https://github.com/yingyeothon/nodejs-toolkit/tree/master/packages/actor-system-redis-support)

위 방법에서는,

- `messageCount`로 보장되는 `mutex` 구간과,
- `dump` 가능한 `concurrent` 자료구조를 통해 처리된 `messageCount`를 한 번에 `CAS`해보는

방법을 사용했다. 하지만 `Redis`에서는 `dump` 가능한 `concurrent` 자료구조도 딱히 없고, `CAS`는 더더욱 없기 때문에, 조금은 더 비효율적이지만 `lock`을 사용하는 간단한 방법으로 문제를 다시 풀어보자. 다음과 같이 정리해볼 수 있다.

```typescript
await actor.queue.enqueue(message);
while (!(await actor.queue.isEmpty()) && (await actor.lock.tryAcquire())) {
  let message = null;
  while ((message = await actor.queue.dequeue()) != null) {
    await dispatch(message);
  }
  await actor.lock.release();
}
```

~~await이 풍년이다.~~

1. queue에 message를 넣었는데.
2. queue가 비어있지 않고 actor의 lock을 획득했을 때에만 처리하러 간다. 만약 다른 thread가 _이미 처리했다면_ queue가 _이미 비었을_ 수도 있고, 혹은 _아직 처리는 안 했지만_ actor는 _점유했을_ 수도 있기 때문이다.
3. 우여곡절 끝에 actor를 점유했다면, queue를 소진할 때까지 다 처리해본다.
4. 다 처리가 된 것 같으니까 lock을 풀어보자. **물론 queue가 비어있다고 판단한 시점부터 lock을 푼 시점 사이에는 엄청난 concurrent event가 발생할 수 있다.** 예를 들어 다른 thread가 queue에 새로운 message를 넣었는데 lock이 안 풀려서 점유를 못했고, 원래 처리하던 thread는 그 message 못 보고 lock 풀고 나갈 수 있다.
5. 그러니까 다시 처음으로 돌아가보자. 만약 lock 풀고도 queue가 비어있다면, 정말 다 비었거나 아니면 다른 thread가 처리하고 있다는 뜻이다. queue가 안 비었어도 lock을 잡을 수 있냐 없냐로 결판이 난다.

재미있는 점은 이 actor model에 concurrency 수준에 따라 조금 더 최적화해볼 수 있다는 점이다. queue와 lock은 모두 `Redis`로 구현되는 외부 시스템이므로 이 자원에 접근하기 위해서는 적어도 network latency를 감수해야 한다. `queue.isEmpty`나 `lock.tryAcquire`는 이런 비용을 야기할 수 있으므로 다음과 같은 지점을 고민하여 코드 순서를 변경해 좀 더 나은 효율을 추구해볼 수 있다.

1. concurrency가 높은 경우 message를 막 넣었어도 다른 thread에 의해 처리될 확률이 더 높을 수도 있다. 이 경우 lock을 걸고 queue의 empty를 확인하면 이미 queue가 empty일 확률이 높다. 따라서 이 경우는 차라리 queue empty 검사하고 lock 거는 것이 더 낫다.
2. concurrency가 정말 낮아서 다른 thread가 처리할 가능성이 굉장히 낮은 경우에는 방금 message를 넣었는데 queue가 empty일리가 없다. 때문에 바로 lock 걸로 _dequeue_ 해서 처리하고 unlock한 뒤 queue empty를 검사하는 것이 조금이라도 비용을 더 아낄 수 있다.

위 코드에서는 별 고민없이 바로 `dequeue`를 해서 처리를 시도했는데 사실 처리 도중 프로세스 강제 종료와 같은 불의의 사고를 당하면 그 메시지는 소실되어 버린다. 이를 안전하게 보호해주려면 다음과 같이 `peek-dequeue` 구조를 만들어주는게 차라리 더 낫다. 물론 이 때문에 network latency를 한 번 더 감수해야 함은 어쩔 수가 없다.

```typescript
let message = null;
while ((message = await actor.queue.peek()) != null) {
  await dispatch(message);
  await actor.queue.dequeue();
}
```

#### [`Redis`로 만드는 `queue`](https://github.com/yingyeothon/nodejs-toolkit/blob/master/packages/actor-system-redis-support/src/queue.ts)

`Redis`는 `RPUSH`와 `LPOP` 명령을 지원한다. 이는 value type이 collection인 경우 right-push로 새 element를 추가하다가 left-pop으로 첫 번째 element를 가져오는 명령이다.

물론 `LPUSH`와 `RPOP`으로도 구성할 수 있지만 peek을 위해 `LINDEX`를 쓰려고 `RPUSH`, `LPOP`을 사용하였다. `LLEN`을 써서 queue의 길이를 잴 수 있고, 이것으로 queue empty 여부를 확인할 수 있다.

#### [`Redis`로 만드는 `lock`](https://github.com/yingyeothon/nodejs-toolkit/blob/master/packages/actor-system-redis-support/src/lock.ts)

`GETSET` 명령을 사용하면 된다. 이 명령은 예전 값을 가져오고 지정된 값을 쓰는 `atomicExchange` 명령어다. 이 값을 사용해서 특정 Key에 대한 값을 1로 바꿨을 때

- 반환 값이 0이거나 null이면 lock에 성공한 것이고,
- 반환 값이 1이면 이미 누군가 값을 1로 바꿔놓은 상태이므로 lock 실패다.

unlock을 수행했을 때에는 다시 `GETSET`을 써서 0으로 바꿔줄 수도 있지만 굳이 `Redis`에 0으로 기록된 lock tuple을 많이 남겨봐야 좋을게 없으므로 깔끔하게 `DEL`로 지워주면 되겠다.

물론 분산 Lock이므로 누가 Lock을 걸었는지 등을 기록해서 추적이 편하게 만들어주는 것도 중요하고, 혹시 lock은 했는데 unlock은 못 한 상태로 thread가 죽은 경우를 대비하기 위해 lock에 TTL을 도입하는 방법도 고민해볼 수 있겠지만 여기서는 간단하게 구현했다.

### [AWS Lambda에서의 Actor model](https://github.com/yingyeothon/nodejs-toolkit/tree/master/packages/actor-system-aws-lambda-support)

AWS Lambda는 최대 수행 시간이 API Gateway에 연동된 경우 30초, 기타 다른 비동기 이벤트에 의해 기동될 경우 최대 900초이다. 이 제약으로 인해 위 actor model을 그대로 쓸 수가 없고 timeout으로 instance가 끝나기 전에 점유한 actor를 놓아주고 나올 필요가 있다.

```typescript
const isAlive = () =>
  Date.now() - lambdaEpoch < (fromAPI ? 5 * 1000 : 899 * 100);

await actor.queue.enqueue(message);
while (
  isAlive() &&
  !(await actor.queue.isEmpty()) &&
  (await actor.lock.tryAcquire())
) {
  let message = null;
  while (isAlive() && (message = await actor.queue.peek()) != null) {
    await dispatch(message);
    await actor.queue.dequeue();
  }
  await actor.lock.release();
}
if (!isAlive()) {
  new AWS.Lambda()
    .invoke({
      FunctionName: process.env.BOTTOM_HALF_LAMBDA_NAME,
      InvocationType: "Event",
      Qualifier: functionVersion || "$LATEST",
      Payload: JSON.stringify(/* something for next generation */)
    })
    .promise();
}
```

Lambda가 시작될 때의 `Date.now()` 값을 어딘가 기록해두고, `isAlive` 함수에서 기대 생존 시간과 비교해서 아직 처리를 더 할 수 있는지 확인한다. 그리고 더 처리할게 남았는데 `isAlive`하지 않아서 종료된 경우 다음 Lambda를 실행해서 작업을 이어서 처리할 수 있게 해준다. 예를 들어 `actorName` 같은 것을 넘기면 작업을 이어서 처리할 수 있을 것이다. 이 구조가 커널의 interrupt 처리와 비슷하기 때문에 이름을 `BOTTOM_HALF_LAMBDA`라고 붙여주었다. 물론 `isAlive` 실패에 의해 loop가 종료된 것인지는 좀 더 조건을 구분해야 하지만 이 글에서는 그 부분을 심각하게 여기지 않고 대충 넘어갔다.

`BOTTOM_HALF_LAMBDA_NAME`은 `process.env`를 통해 전달되는 값인데 `serverless.yml`을 통해 다음과 같이 정해줄 수 있다. 물론 `serverless.yaml`에 `bottomHalf`라고 Lambda 함수를 등록해두었을 경우를 가정한 것이다.

```yaml
environment:
  BOTTOM_HALF_LAMBDA: ${self:service.name}-${self:provider.stage}-bottomHalf
```

당연한 이야기지만 API Gateway에 연결될 Lambda와 bottomHalf로 기동될 Lambda는 timeout이 다르므로 같은 Lambda를 사용할 수 없다. 때문에 조금은 귀찮지만 Lambda를 따로 등록해서 사용해야 한다.

### 한계

처음에 `Redis`가 dedicated라서 안 쓴다더니 lock과 queue 관리를 위해서 써버렸다. 사실 비용이 조금 더 나오긴 하지만 queue는 SQS로 대체할 수 있고, lock은 현재 딱히 좋은 비용 최적화의 대체제가 없다.

하지만 다시 처음으로 돌아가서 보면(?) 이걸 하려는 목적 자체가 거의 요청되지 않는 서비스의 비용 최적화였다. 그럼 SQS 요청도 없을테니 비용도 거의 없을거고 lock만 어떻게 해결하면 되겠는데 이 때 보게 된 것이 AWS Lightsail의 1 vCPU, 512MB, 20GB SSD, 1TB network traffic 사양에 _3.50USD/month 요금인_ instance 였다. 이거라면 위처럼 별로 복잡하지 않는 일을 처리하는 Redis는 정말 무난하게 돌아갈 것이다. 물론 여기에 MySQL을 띄우는 방법도 있겠지만 아무래도 managed가 아니다 보니 걱정되는 점이 좀 있다.

actor의 lock과 queue라는 임시 상태를 관리하기 좋은 서버리스 서비스가 나오길 기대하면서 그 전까지는 한 달에 \$3.5가 아깝지 않을 정도로 개인 프로젝트를 많이 띄워두자는 마음으로 현재 사용하고 있다.

### 응용

이제 AWS Lambda에서 actor model로 동일한 actor에 대한 처리는 하나의 Lambda instance에서만 수행됨을 보장할 수 있게 되었다. 이제 처음 이야기했던 서버리스 저장소가 가능해진다.

1. API Gateway로부터 수정 요청이 들어온다.
2. APIGatewayProxyEvent로부터 actor name을 적절히 결정하고, 수정을 위한 message를 만든다.
3. actor에게 message를 보낸다.
4. 처리를 시도해본다. 만약 lock을 못 잡거나 queue가 empty라면 동시에 요청된 다른 Lambda에 의해 처리되고 있다는 것이다.

4)에 의해 동시 수정에 의해 한 쪽의 변경점이 소실되는 문제는 막을 수 있다. 하지만 요청한 API의 결과로 바로 수정된 내용을 받아볼 수 없을 수는 있다. 때문에 다음의 한계를 고민해야 한다.

- 수정을 요청한 API가 그것이 반영될 때까지 확인을 반복할텐데, 얼마씩 쉬면서 언제까지 기다려볼지 잘 조정해야 한다.
- 확률적으로, APIGateway LambdaProxy에서 다른 요청들을 계속 처리해서, 그 API 요청을 기다리는 사용자는 남의 요청을 처리해주는 것을 계속 기다리게 될 수 있다. 남의 것을 얼마나 처리할 것인지 시간을 잘 조정해야 한다.

즉 API Latency를 고민해서 적절한 time limit을 지정해야겠다. 이에 대한 자세한 내용은 추후 **Leaderboard 만들기** 에서 알아보고, WebSocket을 사용한 callback에 대해서는 **여름 새벽 앱 개발기** 에서 알아보기로 하겠다.
