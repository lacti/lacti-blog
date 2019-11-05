---
title: Serverless + React로 알아보는 Lambda의 수행 시간 개선
tags: ["aws", "serverless", "typescript", "lambda"]
shortdesc: "Lambda 기동 시간 개선을 위한 몇 가지 최적화 기법을 알아보자."
---

[예전 글](https://lacti.github.io/2019/10/05/serverless-html-bundle/)에서 Serverless Web API와 함께 `CRA`로 만든 html bundle 파일을 `serve`하는 API를 만드는 법을 정리했다. 이번 글에서는 그 구조에서 발생할 수 있는 성능 문제와 해결법에 대해서 정리해보려 한다.

### Lambda의 수행 시간

API Gateway나 WebSocket API에 의해 Lambda가 실행되어 요청의 처리가 완료되기까지 다음과 같은 세 구간의 소요 시간이 존재한다.

1. Lambda instance가 준비될 때까지 필요한 시간 (`Lambda init`)
2. 실행된 Lambda의 handler가 수행되기 전 global 영역에 있는 context가 초기화되는 시간 (`Invocation (1)`)
3. 실행된 Lambda의 handler가 수행되는 시간 (`Invocation (2)`)

API latency를 개선하려면 위 3가지 구간에 대해 모두 신경을 써야 한다. 이를 위해서는,

1. Lambda가 빨리 기동될 수 있도록 package를 최대한 줄여야 한다. 코드도 줄여야 하고 같이 packaging되는 파일도 최대한 줄여야 한다.
2. Lambda container가 재활용될 수 있으므로 그 점을 고려하여 적절한 자원을 이 영역에서 초기화해야 하지만 불필요한 부분까지 초기화하지는 않도록 memoization을 잘 고려해야 한다.
3. 실행할 handler를 최대한 효율적으로 작성해야 한다.

3)은 늘 하듯이 코드를 효율적으로 잘 만들면 되고, 2)는 [`mem`](https://github.com/sindresorhus/mem) 같은걸 적극적으로 써서 Redis connection이나 DB connection 등을 필요할 때 잘 최적화해서 나중에 Lambda container가 재활용될 때에도 덕을 볼 수 있도록 구조를 잘 잡아주면 되겠다.

놓치기 쉬운 부분은 1)인데 실제로 나도 지난 번 글을 작성하면서 이 부분을 놓쳤다 (...)

Lambda의 기동 시간은 다시 세부적으로 보면 a) Lambda container를 할당 받는 시간 b) S3로부터 package 파일을 복사하는 시간 c) 그리고 그 package 파일의 압축을 푸는 시간으로 볼 수 있다. a)는 우리가 어떻게 할 수 있는 부분이 아니므로 b)와 c)를 좀 더 신경써야 한다.

### 기동 시간 최적화

[예전 글](https://lacti.github.io/2019/08/08/aws-lambda-to-compile-cpp/)에서 정리했던 것처럼 기동 시간을 최적화하기 위해서는 Lambda에서 수행할 코드가 담긴 package 파일을 최소화하면 된다. 이 관점으로 보면 지난 번에 소개한 방법에 큰 문제가 있음을 알 수 있다.

- `html-bundle.zip` 파일을 `CopyWebpackPlugin`으로 복사했으므로 package 파일에 이 파일이 늘 포함된다.
- 게다가 `html-bundle.zip` 파일을 `-0`으로 압축했으므로 용량이 크다.
- `serve` 함수가 `unzip`을 해야 하는데 이 library의 크기도 작지 않으므로 webpack으로 만들어지는 JavaScript도 100KB 수준으로 크다.
- API 함수들은 사실 위의 모든 것들이 필요 없는데 이 모든 부담을 지고 있어야 한다.

HTML을 serve하는 것은 사실상 몇 차례 호출되지 않지만 같이 추가되는 API 함수들은 이 front-end 페이지에 의해 지속적으로 호출될 수 있다. 하지만 이 API 함수들의 package도 본의 아니게(?) 상당히 무거워졌으므로 기동 시간과 수행 시간에서 손해를 보기 때문에 의도치 않게 느려지게 된다.

예를 들어, 최근 만들고 있는 [click-and-more](https://github.com/lacti/click-and-more) 프로젝트는 WebSocket API와 Session server로써의 Lambda를 테스트하고 있는데 이 때 WebSocket을 통한 요청이 게임에 참여한 모든 플레이어들에 의해 초당 100번 이상 호출될 수 있는 구조이다. 하지만 위 내용들에 의해 WebSocket의 message를 받는 Lambda handler도 Lambda Init에 400ms 정도가 필요하게 되고 Invocation time에 100~200ms까지 소요되는 결과를 보였다.

이처럼 실제 처리 시간이 기대 처리 시간에 훨씬 못 미치는 경우,

- Lambda instance가 그 수준이 맞아질 때까지 계속 새롭게 기동되어 돈을 있는대로 소모하게 되는데
- 그 와중에 Lambda Init에 소모되는 시간이 상당히 크기 때문에 효율이 별로 좋지 않고
- 그럼에도 불구하고 Lambda의 평균 요청 처리 시간이 길어서 재활용을 기대하기도 어렵다.

~~실제 문제는 기동 시간 말고도 있었지만~~ 일단 기동 시간을 최적화하는 요소부터 알아보자.

### Package 분할

문제 중 하나는 HTML을 serve하는 함수가 사용하는 라이브러리들의 대부분은 다른 API에서는 별로 사용할 일이 없는 주제에 용량도 꽤 크다는 점이다. `html-bundle.zip` 파일과 이 불필요한 라이브러리를 API 함수에서 제거하려면 각 Lambda handler마다 package를 따로 구성하면 된다.

다행히 `Serverless framework`은 `individual package` 기능을 제공하기 때문에 큰 수정 없이 이 방법을 사용할 수 있다.

```yaml
package:
  individually: true
```

다만 `serverless-webpack`을 사용할 경우 `webpack`을 `serverless.yml` 파일에 등록된 handler 개수만큼 병렬로 돌리기 때문에 그냥 띄운 node로는 OOM으로 제대로 package가 만들어지지 않는다. 이를 해결하기 위해 다음과 같이 빌드할 때의 node memory 크기를 늘려준다.

```json
"scripts": {
  "build": "node --max-old-space-size=4096 node_modules/serverless/bin/serverless package",
  "deploy": "node --max-old-space-size=4096 node_modules/serverless/bin/serverless deploy"
}
```

이제 각 handler별로 package는 따로 만들어졌지만 여전히 용량이 달라지지 않았다. 그 이유는

- 아마도 하나의 JavaScript/TypeScript 파일에 여러 handler의 entrypoint를 만들어서 각각을 `serverless.yml`의 handler로 mapping 했기 때문에 결국 webpack으로 만들어지는 `bundle.js` 파일이 tree shaking의 덕을 별로 못 봤기 때문일 수도 있고
- 사실 이 문제가 더 큰데, `CopyWebpackPlugin`에 의해 `html-bundle.zip` 파일이 모든 package 파일에 복사되었기 때문일 수 있다.

### handler를 파일 단위로 분리하기

간단하게 Serverless API를 구성한다면 다음과 같이 하나의 파일에 여러 handler를 `export` 하고 각각을 `serverless.yml` 의 handler에 연결해서 사용할 수 있다.

```typescript
// handler.ts
export const serveHTML: APIGatewayProxyHandler = async event => {
  /* ... */
};
export const getPosts: APIGatewayProxyHandler = async event => {
  /* ... */
};
export const putPost: APIGatewayProxyHandler = async event => {
  /* ... */
};
```

```yaml
functions:
  serveHTML:
    handler: handler.serveHTML
    events:
      - http: GET /
  getPosts:
    handler: handler.getPosts
    events:
      - http: GET /posts
  putPost:
    handler: handler.putPost
    events:
      - http: PUT /post/{postId}
```

이렇게 구성했다면 제 아무리 individual packagee를 만든다고 해도 모든 코드는 다 `handler.ts` 안에 있으므로 Webpack의 결과로 나온 `handler.js` 파일은 `serveHTML`, `getPosts`, `putPost`에서 사용하는 모든 라이브러리 코드들과 각각의 코드를 모두 포함하고 있게 된다. 그리고 그 중 어떤 함수가 수행될 때에도 그 모든 코드가 다같이 해석되어야 하는 불필요한 자원 소모가 뒤따르게 된다.

이를 효율적으로 개선하려면 다음과 같이 파일을 분리해주면 된다.

```typescript
// handler/serveHTML.ts
export const handle: APIGatewayProxyHandler = async event => {
  /* ... */
};
// handler/getPosts.ts
export const handle: APIGatewayProxyHandler = async event => {
  /* ... */
};
// handler/putPost.ts
export const handle: APIGatewayProxyHandler = async event => {
  /* ... */
};
```

```yaml
functions:
  serveHTML:
    handler: handler/serveHTML.handle
    events:
      - http: GET /
  getPosts:
    handler: handler/getPosts.handle
    events:
      - http: GET /posts
  putPost:
    handler: handler/putPost.handle
    events:
      - http: PUT /post/{postId}
```

이제 individual package 옵션에 의해 생성되는 `serveHTML.zip`, `getPosts.zip`, `putPost.zip` 세 가지 파일은 모든 코드를 포함하지 않고 각각 `handler/serveHTML.js`, `handler/getPosts.js`, `handler/putPost.js` 파일만 가지게 된다.

| package 파일  | 분리하기 전 | 분리한 후            |
| ------------- | ----------- | -------------------- |
| serveHTML.zip | handler.js  | handler/serveHTML.js |
| getPosts.zip  | handler.js  | handler/getPosts.js  |
| putPost.zip   | handler.js  | handler/putPost.js   |

당연히 용량도 작아지고 해석해야 할 코드의 부담도 훨씬 줄어든다. 그리고 `html-bundle.zip` 파일 처럼 외부 의존 파일을 꼭 필요한 함수의 package에만 넣어줄 수 있다.

### package에 외부 파일 추가하기

`serverless-webpack`을 사용하지 않는다면 `serverless.yml`의 `package.include`를 사용해서 원하는 파일을 추가할 수 있겠지만 `serverless-webpack`에서는 어째 이 옵션이 잘 동작하지 않는다. 때문에 지난 번 글에서는 이를 위해 `CopyWebpackPlugin`을 사용했는데 문제는 이건 Webpack에 간섭하는 plugin이기 때문에 individual package를 구성할 때에도 모든 package 파일에 지정된 파일이 들어가게 된다.

따라서 Serverless lifecycle 상 Webpack이 끝나고 package를 만들기 직전에 오로지 `serveHTML`을 수행하는 시점에만 `html-bundle.zip` 파일을 적절한 곳에 복사해주는 작업을 수행해야 한다. 이 시점은 [`serverless-webpack`](https://github.com/serverless-heaven/serverless-webpack#the-event-lifecycles-and-their-hookable-events-h) 문서에 따르면 `webpack:package:packExternalModules` 시점 정도가 되고, 이 시점에 간섭하려면 Serverless의 plugin을 만들어야 한다. **하지만 이는 매우 귀찮은 일이다.**

다행히도 이런 일을 쉽게 처리해주는 좋은 plugin이 있다. `serverless-plugin-scripts`이라는 것으로 `custom.scripts.hooks.[lifecycle]`에 실행할 명령어를 입력하면 그것을 수행해준다. 이 때 [단순히 NodeJS의 `execSync` 함수](https://github.com/mvila/serverless-plugin-scripts/blob/master/src/index.js#L58)를 사용하므로 바로 명령어를 입력해도 어느 정도는 잘 실행을 해준다.

Webpack이 완료되고 package 파일을 만들기 전에 각각의 Webpack 결과물들은 `.webpack/HANDLER-NAME`에 위치하게 된다. 따라서 `html-bundle.zip` 파일을 이 위치로 복사해주면 되겠다.

```yaml
# serverless.yml
custom:
  scripts:
    hooks:
      "webpack:package:packExternalModules": cp html-bundle.zip .webpack/serveHTML
```

이제 `yarn build`로 memory가 여유로운 NodeJS로 기동하는 serverless가 만드는 package를 보자. `serveHTML.zip` 파일에만 `html-bundle.zip`이 잘 들어가있는 것을 확인할 수 있다.

조금만 신경써서 만들었다면 이제 다른 API들의 package 크기는 압축 후 `1~3KB` 수준일 것이고 이제 이 API들은 첫 기동에서도 Lambda init이 100ms 수준으로 꽤나 준수한 속도를 보일 것이다. _물론 여전히 serveHTML은 400~500ms 수준의 기동 시간을 보일 것이다._

#### function 단독 배포를 고려하기

위 hooks script도 충분히 잘 동작하지만 Serverless stack을 전체 배포하는 것이 아니라 함수 하나만 수정해서 배포하는 경우에 문제가 발생한다. 예를 들면 `putPost`에 있는 버그를 고쳐서 다음과 같이 `putPost` 함수만 갱신하는 경우이다.

```bash
sls deploy -f putPost
```

_이 경우에는 `putPost` 함수만 webpack하므로 NodeJS의 메모리를 크게 신경써주지 않아도 문제가 없다._ 아무튼 이 경우에도 여전히 hooks script가 수행되려 할 것이고, 이 때에는 webpack의 결과로 오로지 `.webpack/putPost`만 준비되므로 `.webpack/serveHTML` 디렉토리가 존재하지 않아 hooks script가 실패하고 serverless 배포가 멈추게 된다.

해결법은 아주 간단한데, 해당 디렉토리가 있을 때에만 복사를 하는 것이다. 다만 그런 명령어를 `execSync` 내에서도 잘 동작하게 구성하는 것은 귀찮은 일이므로 다음과 같이 bash script를 만들어서 좀 더 간단하게 문제를 풀어볼 수 있겠다.

```bash
#.prepackage.sh
#!/bin/bash
BUNDLE_ZIP="html-bundle.zip"
SERVE_DIR=".webpack/serveHTML"

if [ -d "${SERVE_DIR}" ]; then
  cp "${BUNDLE_ZIP}" "${SERVE_DIR}"
  echo "Add ${BUNDLE_ZIP} to ${SERVE_DIR}"
else
  echo "Skip because ${SERVE_DIR} doesn't exist."
fi
```

이제 hooks script에서 다음과 같이 실행하면 된다.

```yaml
# serverless.yml
custom:
  scripts:
    hooks:
      "webpack:package:packExternalModules": /bin/bash .prepackage.sh
```

### 정리

Lambda의 수행 시간을 고려하는 것은 기본 중의 기본인데 최근 Lambda에 TensorFlow나 C++ compiler를 올리거나 React로 만든 파일을 serve하는 등, Lambda를 Lambda답지 않게 쓰는 작업에 몰두하다보니 기본을 잊고 있었다.

다행히 [잉여톤 16회차](https://yyt.life/2019/10/26/the-16.html)를 하면서 [Lambda의 actor model](https://lacti.github.io/2019/08/16/actor-model-on-aws-lambda/) 기반의 간단한 [click 게임](https://8libfmsupb.execute-api.ap-northeast-2.amazonaws.com/dev)을 [만들면서](https://github.com/lacti/click-and-more) 지금까지 쌓아올린 기술들의 문제점을 발견/수정/최적화를 고민해볼 기회를 얻을 수 있었고 그 덕분에 그간 고려하지 않았던 package 분리에 대해서도 정리해볼 수 있었다.

HTML을 serve하기 위한 Serverless stack을 예시로 들기는 했지만, 어쨌든 Serverless API의 latency 개선을 위해 늘 1) 함수를 적절히 분리해 각 handler마다 적절한 codebase 수준을 유지할 수 있게 만들어 Lambda 초기화 시간을 줄이는 것과 2) Global 영역을 적절하게 사용하여 적절한 자원 재사용을 도모하는 것을 고려해야겠다.

이런 고민을 많이 하게 된 계기인 [click-and-more](https://github.com/lacti/click-and-more)를 예시로, 다음 글에서는 WebSocket API와 Lambda를 활용한 간단한 Session 게임 서버의 구축에 대해 정리해보도록 하겠다.
