---
title: Serverless + X-Ray + TypeScript
tags: ["aws", "serverless", "xray", "typescript"]
---

[AWS X-Ray](https://aws.amazon.com/ko/xray/)는 AWS가 제공하는 tracing solution이다.

> AWS X-Ray는 개발자가 마이크로 서비스 아키텍처를 사용해 구축된 애플리케이션과 같은 프로덕션 분산 애플리케이션을 분석하고 디버그하는 데 도움이 됩니다. X-Ray를 사용해 자신이 개발한 애플리케이션과 기본 서비스가 성능 문제와 오류의 근본 원인 식별과 문제 해결을 올바로 수행하는지 파악할 수 있습니다. X-Ray는 요청이 애플리케이션을 통과함에 따라 요청에 대한 엔드 투 엔드 뷰를 제공하고 애플리케이션의 기본 구성 요소를 맵으로 보여줍니다. X-Ray를 사용하여 간단한 3-티어 애플리케이션에서부터 수천 개의 서비스로 구성된 복잡한 마이크로 서비스 애플리케이션에 이르기까지 개발 중인 애플리케이션과 프로덕션에 적용된 애플리케이션 모두 분석할 수 있습니다.

설명이 기니까 대충 요약하면, 각 실행 segment의 `(begin, end, elapsed)`를 call tree 형태로 저장하여 시각화 해주고 이것이 여러 AWS component에서 발생할 경우 그에 대한 적절한 Service map을 보여주는 서비스란 뜻이다. 아래의 그림을 보면 좀 더 확실히 와닿는다.

| Service map                                                                                                                     | Traces                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ![Service map](https://d1.awsstatic.com/product-marketing/X-Ray/X-Ray_Screenshot1.b5f74e2132e72c0d180bb2199d20238742753b2f.jpg) | ![Traces](https://d1.awsstatic.com/product-marketing/X-Ray/X-Ray_Screenshot2.75f8f7dfe80e70b94f401291d1ae3cb0fc9b4ba3.png) |

- [https://aws.amazon.com/ko/xray/features/](https://aws.amazon.com/ko/xray/features/)

[Serverless framework](https://serverless.com)에서는 [꽤 예전부터 Serverless stack에 X-Ray 연동을 지원하기 시작했다.](https://serverless.com/blog/framework-release-v141/) 이제 이와 같은 옵션을 `serverless.yml`에 추가하는 것만으로도 기본적인 API Gateway + Lambda의 Service map과 Traces를 확인할 수 있다.

```yaml
provider:
  tracing:
    apiGateway: true
    lambda: true
```

하지만 함수 단위로 직접 segment를 만들어서 모니터링을 하고 싶다거나, 연동되는 다른 AWS component간의 측정을 진행하려면 [`aws-xray-sdk`](https://github.com/aws/aws-xray-sdk-node)를 사용해야 한다. 이 package는 이미 개발된 [`express`](https://www.npmjs.com/package/aws-xray-sdk-express), [`restify`](https://www.npmjs.com/package/aws-xray-sdk-restify), [`mysql`](https://www.npmjs.com/package/aws-xray-sdk-mysql) 등에 대한 추적도 수행할 수 있는 라이브러리를 제공한다. 이에 대한 사용법은 [공식 문서](https://docs.aws.amazon.com/xray/latest/devguide/xray-sdk-nodejs.html)에서 잘 찾아볼 수 있으므로 이 글에서는 보다 간단한 수준으로 **Serverless framework에서 aws-xray-sdk-core를 TypeScript + Webpack**으로 사용하는 방법에 대해 정리해보려고 한다.

진행되는 내용에 대한 전체 코드와 간단한 설명은 [GitHub: hello-serverless-xray-typescript](https://github.com/lacti/hello-serverless-xray-typescript)에서 확인이 가능하다.

### 프로젝트 시작

Serverless framework이 설치되어있다는 가정 하에, 다음과 같이 프로젝트를 시작할 수 있다.

```bash
# Install Serverless framework, first.
npm i -g serverless

# Prepare a working directory.
mkdir hello-serverless-xray-typescript && \
  cd hello-serverless-xray-typescript

# Create the scaffold using a create command of Serverless cli.
sls create --template aws-nodejs-typescript --name hello-serverless-xray-typescript
```

그럼 이제 template으로부터 여러 파일이 자동으로 생성된다. TypeScript와 Webpack 설정도 기본으로 들어있어서 아주 편하다. 하지만 예전에 만들어진 template이므로 참조 라이브러리들이 오래되었을 수 있으니 모두 최신으로 갱신해준다.

```bash
yarn add -D @types/aws-lambda @types/node@10 serverless-webpack ts-loader typescript webpack
```

### `aws-sdk` 추가

`aws-xray-sdk`는 `aws-sdk`를 참조로 가진다. 하지만 [`aws-sdk@2.488.0`는 AWS Lambda의 runtime에 이미 포함되어있으므로](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) 다음과 같이 `optionalDependencies`로 추가해주고 `webpack.config.js`에서는 `externals`에 넣어 bundle에 포함되지 않도록 해준다. `aws-sdk`는 너무 크기 때문에 bundle에 들어가면 용량이 급격히 증가하고, 이는 cold start 지연의 원인이 될 수 있다. _물론 사용하고자 하는 함수가 AWS Lambda에서 지원하는 `aws-sdk`보다 최신에만 있다면 어쩔 수 없이 `aws-sdk`를 포함해서 업로드해야 한다._

```bash
yarn add -O aws-sdk@2.488.0
```

📄 webpack.config.js

```diff
      filename: "[name].js"
    },
    target: "node",
+   externals: [/aws-sdk/],
    module: {
      rules: [
        // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
```

### `aws-xray-sdk-core` 추가

`aws-xray-sdk`는 `express`, `mysql` 등의 기반을 쉽게 추적할 수 있는 middleware를 모두 포함하고 있어 package 크기가 꽤 크다. 만약 추적할 대상이 AWS component나 직접 개발한 함수라면 `aws-xray-sdk-core`를 추가하는 것만으로도 충분하다. 다음과 같이 추가하자.

```bash
yarn add aws-xray-sdk-core
```

하지만 슬프게도 이 official package는 type definition을 가지고 있지 않다. 더욱이 [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)에도 올라와있지 않다. 예전에 작성된 [index.d.ts에 대한 PR](https://github.com/aws/aws-xray-sdk-node/pull/109)이 있지만 작업 중간에 중단되었는지 그 상태로 계속 멈춰있다. 일단 급한대로 이 파일을 가져다가 [`typings/aws-xray-sdk-core/index.d.ts`](https://github.com/lacti/hello-serverless-xray-typescript/blob/master/typings/aws-xray-sdk-core/index.d.ts)에 넣어주자.

단, 이따 사용할 `captureFunc`, `captureAsyncFunc`의 경우 return type이 누락되어 있어 이것만 추가로 수정해주면 된다.

📄 index.d.ts

```diff
   ): SegmentLike | undefined;
   export function getNamespace(): Namespace;

-  export function captureFunc(
+  export function captureFunc<R>(
     name: string,
     fcn: (subsegment: Subsegment) => R,
     parent?: SegmentLike
-  ): void;
+  ): R;

-  export function captureAsyncFunc(
+  export function captureAsyncFunc<R>(
     name: string,
     fcn: (subsegment: Subsegment) => Promise<R>,
     parent?: SegmentLike
-  ): void;
+  ): Promise<R>;

   export function captureCallbackFunc<A extends any[]>(
     name: string,
```

### Webpack 경고 해결

`aws-xray-core-sdk`는 AWS Lambda의 Node.js runtime에 포함되어있지 않으므로 Webpack으로 함께 bundle을 만들어야 한다. 하지만 다음과 같은 경고가 나온다.

```bash
WARNING in ./node_modules/aws-xray-sdk-core/lib/patchers/call_capturer.js 41:32-47
Critical dependency: the request of a dependency is an expression
 @ ./node_modules/aws-xray-sdk-core/lib/segments/attributes/aws.js
 @ ./node_modules/aws-xray-sdk-core/lib/aws-xray.js
 @ ./node_modules/aws-xray-sdk-core/lib/index.js
 @ ./handler.ts

WARNING in ./node_modules/colors/lib/colors.js 127:29-43
Critical dependency: the request of a dependency is an expression
 @ ./node_modules/colors/safe.js
 @ ./node_modules/winston/lib/winston/config.js
 @ ./node_modules/winston/lib/winston.js
 @ ./node_modules/aws-xray-sdk-core/lib/logger.js
 @ ./node_modules/aws-xray-sdk-core/lib/aws-xray.js
 @ ./node_modules/aws-xray-sdk-core/lib/index.js
 @ ./handler.ts
```

그 이유는,

- `aws-xray-core-sdk`가 사용하는 `winston`에서 `colors` 라이브러리를 사용하는데 이 때 `color-theme`를 동적으로 바꾸는 함수가 있어 runtime `require`를 하기 때문에 경고가 발생하고
- `call_capture.js`에서는 AWSClient가 주고 받는 요청들의 일부(`whitelist`)만 capture하게 되는데, 이 값을 `json`으로 바로받아오는게 아니라 외부 `js` 파일을 통해 runtime에 `require`로 가져오는 기능이 `appendWhitelist`에 구현되어 있기 때문이다.

때문에 전자의 경우는 쓸 일이 없으니 무시하면 되고, 후자의 경우는 만약 쓰게 된다면 굳이 `string` type을 넘겨 runtime `require`를 수행하도록 json을 넘기는 쪽으로 사용하면 문제가 없다. 다만 이 `call_capture`가 기본적으로 capture하는 attribute의 whitelist가 [`aws-xray-sdk-core/lib/resources/aws_whitelist.json`](https://github.com/aws/aws-xray-sdk-node/blob/master/packages/core/lib/resources/aws_whitelist.json)에 있기 때문에 이를 Webpack이 제대로 bundle에 넣어주어야 AWSClient로 통신하는 요청에 대해서도 좀 제대로 capture가 될 수 있다.

다행히 Webpack은 2버전부터 `require`하는 JSON 파일을 bundle에 알아서 잘 포함시켜준다. 때문에 별다른 신경을 쓸 필요가 없고, 안심하고 경고를 무시해도 되겠다. 하지만 빌드할 때마다 경고가 계속 나오는 것은 아주 거슬리므로 다음과 같이 정규식을 써서 해당 경고가 더 이상 출력되지 않도록 `webpack.config.js`를 고치도록 하자.

📄 webpack.config.js

```diff
  const path = require("path");
  const slsw = require("serverless-webpack");

+ const ignoreWarnings = [
+   [/call_capturer.js/, /the request of a dependency is an expression/],
+   [/colors.js/, /the request of a dependency is an expression/]
+ ];
+
  module.exports = {
    mode: slsw.lib.webpack.isLocal ? "development" : "production",
    entry: slsw.lib.entries,

    externals: [/aws-sdk/],
    module: {
      rules: [{ test: /\.tsx?$/, loader: "ts-loader" }]
+   },
+   stats: {
+     warningsFilter: warning => {
+       return ignoreWarnings.some(regexs =>
+         regexs.every(regex => regex.test(warning))
+       );
+     }
    }
  };
```

### Sleep 함수 측정

준비가 끝났으니 간단하게 Sleep 함수를 만들어서 잘 측정되는지 확인해보도록 하자. `handler.ts`를 다음과 같이 수정한다.

```typescript
import { APIGatewayProxyHandler } from "aws-lambda";
import "source-map-support/register";
import { captureAsyncFunc } from "aws-xray-sdk-core";

const sleep = (millis: number) =>
  captureAsyncFunc(
    "sleep",
    seg =>
      new Promise<void>(resolve =>
        setTimeout(() => {
          resolve();
          seg.close();
        }, millis)
      )
  );

export const hello: APIGatewayProxyHandler = async () => {
  for (let i = 0; i < 10; ++i) {
    await sleep(100);
  }
  return {
    statusCode: 200,
    body: "OK"
  };
};
```

`sleep` 함수는 지정된 `millis`를 쉬는데 이 때 `aws-xray-core-sdk`의 `captureAsyncFunc` 함수를 사용해서 `segment`를 기록한다. 100ms씩 10번 쉬도록 작성하고 다음과 같이 Serverless stack을 배포한다. 물론 AWS credentials이 개발 환경에 설정되어있어야 한다.

```bash
yarn deploy
```

```bash
api keys:
  None
endpoints:
  GET - https://0000000000.execute-api.xx-xxxxxx-x.amazonaws.com/dev/hello
functions:
  hello: hello-serverless-xray-typescript-dev-hello
layers:
  None
```

배포가 끝나면 다음과 같이 보고서가 출력된다. 여기에 나온 Endpoint를 curl 등으로 호출한 뒤 AWS Management console의 X-Ray에 들어가보면 다음과 같은 Service map과 Traces를 볼 수 있다.

| Service map                                                                                               | Traces                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ![Service map](https://github.com/lacti/hello-serverless-xray-typescript/raw/master/_doc/service_map.png) | ![Traces](https://github.com/lacti/hello-serverless-xray-typescript/raw/master/_doc/traces_detail.png) |

### Capture Function

기본으로 제공되는 `captureFunc`와 `captureAsyncFunc`를 사용하면 이처럼 segment를 만들어서 X-Ray에서 확인할 수 있다. Promise를 포함하는 복잡한 함수의 수행 시간을 확인하거나 오류를 추적할 때 꽤나 도움을 받을 수 있을 것 같다.

하지만 `segment`를 매번 close해주어야 하는 것은 매우 번거로운 일이므로 다음과 같은 간단한 helper를 만들어서 사용할 수도 있겠다.

```typescript
const captureSync = <Args extends any[], ReturnType>(
  name: string,
  target: (...args: Args) => ReturnType
) => (...args: Args) =>
  captureFunc(name, segment => {
    try {
      const result = target(...args);
      segment.close();
      return result;
    } catch (error) {
      segment.close(error);
      throw error;
    }
  });

const captureAsync = <Args extends any[], ReturnType>(
  name: string,
  target: (...args: Args) => Promise<ReturnType>
) => (...args: Args) =>
  new Promise<ReturnType>((resolve, reject) =>
    captureAsyncFunc(name, async segment => {
      try {
        const result = await target(...args);
        segment.close();
        resolve(result);
      } catch (error) {
        segment.close(error);
        reject(error);
      }
    })
  );
```

이제 다음과 같이 사용할 수 있다.

```typescript
const adder = (a: number, b: number) => a + b;
captureSync(adder)(10, 20);

const sleep = (millis: number) =>
  new Promise<void>(resolve => setTimeout(resolve), millis);
await captureAsync(sleep)(1000);
```

### Capture AWSClient

`S3`나 `DynamoDB` 등의 AWS component와의 통신을 capture하려면 처음 client 객체를 만들 때 한 번 `captureAWSClient`로 감싸주면 된다.

```typescript
import { S3 } from "aws-sdk";
import { captureAWSClient } from "aws-xray-sdk-core";

const s3 = captureAWSClient(new S3());
```

만약 AWS namespace 하위의 모든 client를 다 capture하려면 `captureAWS`를 사용하면 된다.

```typescript
import * as rawAWS from "aws-sdk";
import { captureAWS } from "aws-xray-sdk-core";

const AWS = captureAWS(rawAWS);
const s3 = new AWS.S3();
```

### 마무리

AWS Serverless 개발을 하면서 복잡한 Lambda를 만드는 일이 별로 없었기 때문에 사실 이 Traces를 봐도 크게 쓸 일이 없었다. 다만 Lambda의 cold start나 최근에 만든 actor model의 성능 테스트를 하면서 이에 대한 metric을 좀 기록할 수 있는 요소가 필요했는데, 마침 X-Ray가 그 역할을 잘 해주어 많은 도움이 되었다. ~~게다가 100K개가 매달 Free-tier에 속하므로 가난뱅이 서버 모델을 만들기에 딱 좋다.~~

다만 주로 Serverless framework + TypeScript + Webpack 기반을 사용했기 때문에 type definition도 없고 Webpack 경고도 발생하니 최근까지 잘 안 써봤다. 그러다가 우연히 좋은 기회(?)를 얻어 그 추진력으로 내부도 좀 보고 정리도 할 수 있었다. 이전까지는 우선순위가 낮은 선택 요소였는데 앞으로는 필수 기본 요소로 X-Ray를 사용해서 좀 더 측정/추적 가능한 Serverless Stack을 쌓아봐야겠다.
