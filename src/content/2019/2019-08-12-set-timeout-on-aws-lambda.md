---
title: AWS Lambda에서의 setTimeout
tags: ["aws", "serverless", "auth"]
---

[AWS Lambda에서 실행하기 위한](https://www.npmjs.com/package/@yingyeothon/actor-system-aws-lambda-support) [분산 ActorSystem](https://www.npmjs.com/package/@yingyeothon/actor-system)을 개발하고 있다. 처음에는 단순히 actor의 state를 [Redis](https://www.npmjs.com/package/@yingyeothon/repository-redis)나 [S3](https://www.npmjs.com/package/@yingyeothon/repository-s3)에 기록하고 [Redis를 기반으로 작성된 Queue와 Lock](https://www.npmjs.com/package/@yingyeothon/actor-system-redis-support)으로 메시지를 교환하면 될 것이라고 생각하고 열심히 만들고 있었다. 하지만 이 모든 것은 actor간 `Deferred Message`를 교환해야 할 필요가 있는 시점에서 문제가 발생했다. _actor 시스템에 대한 이야기도 충분히 재미있지만 이는 추후에 다뤄보도록 하자._

`Deferred Message`는 `visiblity`가 지정된 시간 뒤에 확보되는 message로 간단히 `setTimeout(() => post(message), millis)`와 같은 형태가 된다. 그렇다면 `setTimeout`을 `AWS Lambda`에서 사용해도 문제가 없을까? 이 문제를 확인하기 위해 AWS Lambda에 대한 기본 성질과 간단한 실험을 진행해보자.

## Lambda는 언제 끝나나

[Understanding Container Reuse in AWS Lambda](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda/) 글에서 자세히 나와있는데 인용해보면 다음과 같다.

> **Timeout.** The user-specified duration has been reached. Execution will be summarily halted regardless of what the code is currently doing.
> **Controlled termination.** One of the callbacks (which need not be the original handler entry point) invokes context.done() and then finishes its own execution. Execution will terminate regardless of what the other callbacks (if any) are doing.
> **Default termination.** If all callbacks have finished (even if none have called context.done()), the function will also end. If there is no call to context.done(), you’ll see the message “Process exited before completing request” in the log (in this case, it really means ‘exited without having called context.done()’).

[AWS Lambda Limits](https://docs.aws.amazon.com/lambda/latest/dg/limits.html)에 나와있듯이 Lambda는 event source에 따라 **30/900초**의 timeout이 존재한다. 그 내에서 `context.done()` 혹은 `callback`을 불러서 Lambda를 정상적으로 끝내야 의도된 종료가 되는데, 최근 NodeJS runtime은 handler가 `Promise`일 경우 그 반환 값이 [`APIGatewayProxyResult`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/aws-lambda/index.d.ts#L497)이면 정상적인 반환으로 처리가 된다.

## setTimeout 처리 확인하기

이를 테스트하기 위한 코드는 [GitHub:lacti/aws-lambda-set-timeout-tester](https://github.com/lacti/aws-lambda-set-timeout-tester)에 올려두었다.

### 간단한 방법

handler 중간에 `setTimeout`이 있으면 어떻게 될까? 아예 한 술 더 써서 `Promise`로 감싸진 `setTimeout` 함수를 다음과 같이 `await`하지 않고 호출한다고 가정해보자. [Serverless framework](https://serverless.com)을 사용해서 만든 `aws-nodejs-typescript`에 다음과 같이 간단한 `setTimeout` 구문을 추가해 보았다. 어떤 결과를 기대할 수 있을까?

```typescript
const sleep = (millis: number) =>
  new Promise<void>(resolve => setTimeout(resolve, millis));

export const hello: APIGatewayProxyHandler = async () => {
  console.log(`Before setTimeout`);
  sleep(3000).then(() => {
    console.log(`setTimeout is called!`);
  });
  console.log(`After timeout`);
  return {
    statusCode: 200,
    body: `Hi, there!`
  };
};
```

배포한 후 API를 한 번 호출한 다음 로그를 확인해보자. 다음처럼 _setTimeout is called!_ 는 로그에서 확인할 수가 없다.

```bash
$ sls deploy
$ curl https://API-DOMAIN/STAGE/hello
Hi, there!
$ sls logs -f hello
START RequestId: GUID Version: $LATEST
TIMESTAMP  GUID  INFO  Before setTimeout
TIMESTAMP  GUID  INFO  After timeout
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB
```

별다른 로그가 없으니 `setTimeout`의 요청을 하던 중 오류가 발생한 것 같지는 않고, `Duration` 시간을 보면 굉장히 작은 걸 보니 차라리 `setTimeout`의 callback이 불리기 전에 Lambda execution이 완료되었다고 가정을 하고 테스트를 좀 더 진행해보자.

```bash
$ curl https://API-DOMAIN/STAGE/hello; echo; \
  sleep 3; \
  curl https://API-DOMAIN/STAGE/hello; echo;
Hi, there!
Hi, there!
$ sls logs -f hello
START RequestId: GUID Version: $LATEST
TIMESTAMP  GUID  INFO  setTimeout is called!
TIMESTAMP  GUID  INFO  Before setTimeout
TIMESTAMP  GUID  INFO  After timeout
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB

START RequestId: GUID Version: $LATEST
TIMESTAMP  GUID  INFO  setTimeout is called!
TIMESTAMP  GUID  INFO  Before setTimeout
TIMESTAMP  GUID  INFO  After timeout
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB
```

뭔가 느낌이 와서 3초를 간격으로 두 번의 API 요청을 해보았다. 이번에는 두 로그에서 모두 `setTimeout is called!`를 볼 수 있다. 재미있는건 둘 다 `Before setTimeout` 이전에 그 로그가 나왔다는 것이다. 뭔가 온 느낌과 이번 결과로 가설을 세워볼 수 있다.

- `setTimeout`의 callback이 완전히 실행이 안 되는 것은 아니다.
- 근데 그게 요청한 Lambda execution에서 실행되기에는 Lambda execution이 너무 빨리 끝난다.
- 그렇다고 그 callback을 버리지는 않고 다음 Lambda execution에 실행해주기는 한다.
- 그렇다고 무조건 다음 Lambda execution에 실행해주는 것 같지는 않고 적어도 3초 뒤에 실행되는 Lambda execution에서만 그 callback이 잘 실행될 수 있다.

예를 들면 [이 쪽에서의 실험처럼](https://github.com/lacti/aws-lambda-set-timeout-tester/blob/master/README.md) 1초 간격으로 API를 4번 호출하면 마지막 로그에서만 첫 번째 execution에서 요청된 setTimeout의 callback이 수행된다는 것이다.

### 좀 더 깊은 방법

위 실험은 로그에 너무 정보가 많이 부족해서 결과를 제대로 확인하기가 어렵다. 때문에 다음과 같이 Lambda execution이 언제 실행되었고 setTimeout이 언제 요청되었으며 그것이 몇 번째 실행인지의 index를 로그에 추가해보도록 하자.

```typescript
let staticIndex = 0;
const now = () => new Date().toISOString();

export const helloWithPromise: APIGatewayProxyHandler = async () => {
  const capturedIndex = ++staticIndex;
  const prefix = () => `[${capturedIndex}][${now()}]`;

  console.log(prefix(), `Before requesting a scheduled job.`);
  const requested = now();
  sleep(3000)
    .then(() => {
      console.log(prefix(), `This is requested from [${requested}]`);
    })
    .catch(error => {
      console.error(prefix(), `Error after 3 seconds`, error);
    });
  console.log(prefix(), `After requesting a scheduled job.`);
  return {
    statusCode: 200,
    body: `${prefix()} requested at [${requested}]`
  };
};
```

[Lambda container는 재사용될 수 있기 때문에](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda/) `staticIndex`와 같은 전역 변수도 Lambda execution 간에 공유될 수 있다. 이제 `setTimeout`이 몇 번째 Lambda execution에서 요청된 것인지 보다 명확하게 확인해볼 수 있다.

```bash
$ curl https://API-DOMAIN/STAGE/hello; echo; \
  sleep 1; \
  curl https://API-DOMAIN/STAGE/hello; echo; \
  sleep 1; \
  curl https://API-DOMAIN/STAGE/hello; echo; \
  sleep 1; \
  curl https://API-DOMAIN/STAGE/hello; echo; \
  sleep 3; \
  curl https://API-DOMAIN/STAGE/hello; echo

[1][2019-08-12T13:57:57.870Z] requested at [2019-08-12T13:57:57.869Z]
[2][2019-08-12T13:57:58.964Z] requested at [2019-08-12T13:57:58.964Z]
[3][2019-08-12T13:58:00.068Z] requested at [2019-08-12T13:58:00.068Z]
[4][2019-08-12T13:58:01.132Z] requested at [2019-08-12T13:58:01.132Z]
[5][2019-08-12T13:58:04.216Z] requested at [2019-08-12T13:58:04.216Z]

$ sls logs -f hello
START RequestId: GUID: $LATEST
2019-08-12 22:57:57.869 (+09:00)  GUID  INFO  [1][2019-08-12T13:57:57.868Z] Before requesting a scheduled job.
2019-08-12 22:57:57.870 (+09:00)  GUID  INFO  [1][2019-08-12T13:57:57.869Z] After requesting a scheduled job.
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB

START RequestId: GUID: $LATEST
2019-08-12 22:57:58.964 (+09:00)  GUID  INFO  [2][2019-08-12T13:57:58.964Z] Before requesting a scheduled job.
2019-08-12 22:57:58.964 (+09:00)  GUID  INFO  [2][2019-08-12T13:57:58.964Z] After requesting a scheduled job.
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB

START RequestId: GUID: $LATEST
2019-08-12 22:58:00.068 (+09:00)  GUID  INFO  [3][2019-08-12T13:58:00.068Z] Before requesting a scheduled job.
2019-08-12 22:58:00.068 (+09:00)  GUID  INFO  [3][2019-08-12T13:58:00.068Z] After requesting a scheduled job.
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB

START RequestId: GUID: $LATEST
2019-08-12 22:58:01.131 (+09:00)  GUID  INFO  [1][2019-08-12T13:58:01.131Z] This is requested from [2019-08-12T13:57:57.869Z]
2019-08-12 22:58:01.132 (+09:00)  GUID  INFO  [4][2019-08-12T13:58:01.132Z] Before requesting a scheduled job.
2019-08-12 22:58:01.132 (+09:00)  GUID  INFO  [4][2019-08-12T13:58:01.132Z] After requesting a scheduled job.
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB

START RequestId: GUID: $LATEST
2019-08-12 22:58:04.215 (+09:00)  GUID  INFO  [2][2019-08-12T13:58:04.215Z] This is requested from [2019-08-12T13:57:58.964Z]
2019-08-12 22:58:04.215 (+09:00)  GUID  INFO  [3][2019-08-12T13:58:04.215Z] This is requested from [2019-08-12T13:58:00.068Z]
2019-08-12 22:58:04.215 (+09:00)  GUID  INFO  [4][2019-08-12T13:58:04.215Z] This is requested from [2019-08-12T13:58:01.132Z]
2019-08-12 22:58:04.216 (+09:00)  GUID  INFO  [5][2019-08-12T13:58:04.216Z] Before requesting a scheduled job.
2019-08-12 22:58:04.216 (+09:00)  GUID  INFO  [5][2019-08-12T13:58:04.216Z] After requesting a scheduled job.
END RequestId: GUID
REPORT RequestId: GUID  Duration: X.XX ms   Billed Duration: X00 ms  Memory Size: 1024 MB  Max Memory Used: XX MB
```

네 번째 execution의 로그를 보면 **[1][2019-08-12t13:58:01.131z] This is requested from [2019-08-12T13:57:57.869Z]** 와 같은 로그를 볼 수 있다. 다른 행의 로그와는 다르게 이 로그는 `[1]`로 시작하는데 그 이유는 이 로그가 첫 번째 execution에서 요청되었기 때문이다. 즉, `capturedIndex`가 첫 번째 execution에서 capture되어 네 번째 execution까지 잘 유지되었다고 볼 수 있다. 아예 3초 더 쉰 뒤에 실행된 다섯 번째 로그는 네 번째 execution에서도 시간이 아직 되지 않아서 불리지 못한 2, 3, 4번째의 `setTimeout`의 callback이 모두 수행된 것을 볼 수 있다.

## 정리

Lambda container가 재사용될 수 있는 점을 이용하여 전역 변수나 `/tmp` 내의 파일들을 서로 다른 Lambda execution 간에 공유해서 사용하는 경우가 있다. 이 성질을 이용하면 `setTimeout` 등의 callback도 이번 Lambda execution이 아니라 다음 Lambda execution에서 실행될 수 있도록 할 수 있다. 하지만 대부분의 경우에서 이는 기대 상황이 아닐 것이고, 오히려 Lambda execution 내에 unresolved Promise나 setTimeout callback이 있어도 Lambda handler가 완료되면 그들은 호출되지 않기 때문에 이들이 모두 정상 동작하기를 바란다면 **반드시 모든 Promise를 await한 후 handler를 반환하도록 코드를 관리해야 하겠다.**

### 한계

물론 Lambda container의 재사용을 기대하고 이런저런 방법을 사용하는 것도 재미있는 일이겠지만 당연히 재사용이 되지 않는 경우가 존재하기 때문에 주의할 필요가 있다. 대표적으로,

- 기존 Lambda execution이 아직 끝나기 전에 새로운 요청을 처리하기 위해 Lambda execution이 하나 더 새로 실행될 수 있다. 이 경우 두 execution은 다른 container에서 수행되므로 저런 context가 공유될 수 없다.
- 마지막 Lambda execution이 대충 10분 정도 전에 실행되어 이미 container가 suspend에서 terminate로 넘어간 경우 새로운 요청을 처리하기 위한 Lambda execution은 새로 실행되는 container에서 수행되므로 저런 context가 공유될 수 없다.

### 여담

위와 같은 행동을 보일 수 있는 이유는 NodeJS runtime의 suspend와 resume이 hypervisor에 의해 잘 수행되기 때문인데 어찌보면 당연한 이야기이지만 이렇게 모든 context가 칼같이 suspend되었다가 resume되고 이 모든 과정이 몇 ms 내에서 일어난다는 점은 신기할 정도이다. 이 쪽은 [microvm](http://firecracker-microvm.io/)의 마법을 좀 더 공부하고 정리해볼 수 있도록 노력해야겠다.
