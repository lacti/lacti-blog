---
title: Serverless로 React 서비스하기
tags: ["aws", "serverless", "typescript", "react"]
shortdesc: "React.js로 만든 페이지를 Serverless로 개발한 API와 통합 배포해보자."
---

서버리스로 이런저런 서비스들을 계속 개발하다보면 닥치는 가장 큰 문제가, RestApi나 WebSocketApi는 쉽게 만들었는데 그에 대한 frontend를 제공해야 하는 경우에는 굉장히 귀찮은 과정을 겪어야 한다는 것이다.

보통 알려진 _정상적인_ 방법은 다음과 같다.

1. API를 API Gateway와 Lambda의 조합으로 배포하고,
2. frontend 결과물을 S3에 업로드한 후 CloudFront에 연결해서 HTTPS로 서비스될 수 있게 하고 Route53으로 Domain을 부여한 후 API에서 CORS 허용을 해준다.

솔직히 개인적으로 1)이 훨씬 재미있고 2)의 작업은 개발하는 것보다 배포하는 과정에서 설정하는게 더 많고, 그 때마다 소모되는 AWS 자원들을(...) 보면 좀 모아서 배포해야 하는게 아닐까 하는 걱정이 들 정도이다. S3나 CloudFront나 모두 배포할 수 있는 최대 개수 상한이 있기 때문이다. ~~물론 요청으로 늘릴 수 있지만 개인 덕질 때문에 늘려달라고 하는 사유를 써야 한다는 점이 좀 민망하다.~~

때문에 이런 frontend를 배포할 수 있는 범용적인 서비스를 만들고 거기에 업로드해서 사용하는 방식도 잠시 고민을 했으나, 어차피 혼자 쓰는게 대부분이고 PoC 보존용인 경우가 훨씬 많고, ~~서비스할 것도 하니고~~ 그냥 API 배포할 때 frontend도 같이 배포할 수 있으면 좋겠다는 생각을 하게 되었다.

물론 API Gateway가 text 계열의 응답은 잘 지원해주고 있기 때문에 HTML 파일을 작성해서 Serverless framework이 배포하는 deployment를 만들 때 포함시켜서 특정 URL에서 그 파일을 내려주도록 설정하는 것도 유효한 전략이다. 다만 `create-react-app` 등을 사용해서 만들어낸 `React` app에 비하면 기본적으로 미관을 위해 신경써줄 것이 많기 때문에 아쉬움이 많이 남아 다시 고민할 수 밖에 없었다. 쓸데없는 곳에 기력을 쏟아붇는 것이 덕질의 즐거움이니 _CRA_ 로 만든 frontend를 잘 묶어서 API Gateway를 통해 서비스할 수 있는 방법에 대해 알아보도록 하자.

### 아이디어

아이디어는 간단하다.

- frontend로 만들어진 파일을 zip으로 묶고
- api에서는 그 파일을 가져가서
- 요청한 URL에 따라 그 path에 해당하는 ZipEntry를 찾아
- API Gateway를 통해 응답하면 되겠다.

[간단한 PoC를 위해 만들어놓은 GitHub repository가 있으니 지루한 설명 대신 그 쪽을 보는 것도 좋겠다.](https://github.com/lacti/serverless-html-bundle)

### 프로젝트 구조

```bash
+ serverless-html-bundle
  - front
  - api
```

`front/`는 `create-react-app`으로 생성된 frontend를 위한 디렉토리이고, `api/`는 `serverless create --template aws-nodejs-typescript`로 만들어진 backend를 위한 디렉토리이다.

### 요청 URL 정리

CRA로 만든 프로젝트를 build하면 기본적으로 index.html에서 참조하는 다른 resource들이 `/` 하위에 있다고 생각하고 결과물을 만들어낸다. 이 주소를 보정하려면 `package.json:.homepage`를 수정하거나 `PUBLIC_URL` 환경 변수를 설정해야 한다.

Serverless framework에 의해 배포되는 RestApi stack은 기본적으로 `https://API-ID.execute-api.REGION.amazonaws.com/STAGE/PATH` 형태를 가지게 되는데, 추후 이를 API Gateway의 Custom domain의 path mapping을 사용해 `/`로 맞춰줄게 아니라면 어쨌든 이 stack으로 서비스되는 주소가 `/STAGE/` 하위에 위치한다는 것을 인지해야 한다. 때문에 CRA 빌드의 결과가 `/`가 아닌 `/STAGE` 밑에서 참조 resource를 찾도록 수정해야 하고 이는 다음과 같은 `.envrc` 설정을 통해 공용으로 관리할 수 있다.

```bash
export STAGE="dev"
export PUBLIC_URL="/${STAGE}"
```

`STAGE`가 `dev`로 설정되었기 때문에 `PUBLIC_URL`은 `/dev`가 될 것이고 요청된 URL에서 이 prefix를 고려해서 zip 내의 파일을 찾으면 path를 잘못 찾을 일을 피할 수 있다. 그리고 추후 `STAGE`가 변경된다거나 path mapping에서 `PUBLIC_URL` 변경이 필요할 경우에도 이 쪽만 바꿔주면 되므로 관리 부담이 조금은 적어지는 기분이다. 물론 local에서의 테스트까지 고려한다면 이 모든 경로를 맞춰주기 위해 조금 더 설정해줄 필요가 있지만 그건 local에 _간단한 nginx reverse proxy를 띄워서_ 해결할 수 있겠다.

어쨌든 저 `STAGE`를 `serverless.yml`에서도 사용해야 아귀가 맞으므로 다음과 같이 바꿔준다.

```yaml
provider:
  stage: ${env:STAGE}
```

### Bundle 만들기

CRA로 만든 frontend는 `react-scripts`의 `build` 명령을 통해 `build/` 하위에 필요한 frontend 파일들을 잘 만들어준다. 물론 한 파일로 만들어주면 아주 편리하겠지만 그건 복잡한 일이고, 대신 전통적인 지혜를 이용해서 이 결과물을 한 파일로 만들자.

```bash
yarn build
cd build && \
  zip -0 -r ../../api/html-bundle.zip *
```

`build` command로 만들어지는 파일은 entrypoint를 담당하는 `html` 파일과 `main.js`와 `css` 파일, 그리고 `png`, `svg`, `json` 등의 몇 개의 resource 파일들이다. 나중에 `mime-type`을 설정해주어야 하니 파일 형식을 잘 기억해두고 zip으로 묶어 `api/` 하위에 위치하도록 한다. frontend를 개발하는 동안에는 `yarn start` 해서 hot-reloading 기능을 십분 활용하여 개발했다 치고, 배포 전에 이와 같은 명령어로 잘 빌드하고 모아서 `api`에게 serving해달라고 넘긴다고 보면 되겠다.

### Bundle 파일을 Serverless 배포에 포함하기

`api` 프로젝트는 Webpack을 사용하고 있기 때문에 Serverless deployment에는 Webpack의 결과만 들어가게 되어있다. `html-bundle.zip` 파일도 여기에 같이 넣어주어야 하므로 `CopyWebpackPlugin`을 사용해서 잘 넣어주도록 하자.

```javascript
// yarn add -D copy-webpack-plugin
const CopyWebpackPlugin = require("copy-webpack-plugin");
module.exports = {
  // ...
  plugins: [new CopyWebpackPlugin(["html-bundle.zip"])]
  // ...
};
```

파일이 잘 포함되었는지 확인하려면 `sls package`할 때 나오는 Webpack 로그를 확인해봐도 좋고, 다음과 같이 생성된 `.serverless` 내의 zip 파일을 확인해봐도 좋다.

```bash
$ unzip -t .serverless/html-bundle-api.zip
Archive:  .serverless/html-bundle-api.zip
    testing: handler.js               OK
    testing: handler.js.map           OK
    testing: html-bundle.zip          OK
No errors detected in compressed data of .serverless/html-bundle-api.zip.
```

### Bundle 서비스하기

이제 `html-bundle.zip` 파일을 Serverless에서 서비스하면 되겠다. 아이디어에서 정리했듯이, 요청 URL에 대응되는 파일을 ZipEntry에서 찾아서 반환하면 된다. Node.js에서 zip을 다루는 것은 [`adm-zip`](http://npmjs.com/package/adm-zip) package가 잘 해주기 때문에 다음과 같이 serve할 resource를 Lambda 기동 시에 메모리에 구축해둘 수 있다.

```typescript
import * as AdmZip from "adm-zip";

const bundleFileName = "html-bundle.zip";
const resources = new AdmZip(bundleFileName).getEntries().reduce(
  (map, entry) => {
    map[entry.entryName] = entry;
    return map;
  },
  {} as {
    [name: string]: AdmZip.IZipEntry;
  }
);
```

전역에 선언해둔 이유는, 나중에 해당 Lamba가 재사용될 때 다시 메모리에 올리는 작업을 하지 않아도 되기 때문에 1ms 정도(...)의 성능 향상이 있을지 모른다는 희망 때문이다.

이제 요청받은 URL을 ZipEntry의 entryName에 맞게 변환해주는 작업을 하자. 사실 간단히 URL에서 `STAGE` prefix만 떼어내주면 되는데 혹시 path mapping에 의해 그것이 사라질 수도 있으므로 약간의 고민을 더 해주면 다음과 같다. 그리고 자주 잊는 내용인데 `index.html`에 대한 요청은 대부분 URL에서 생략하고 `/`으로 전달되므로 이 경우를 추가해주어야 한다.

```typescript
const publicUrl = process.env.PUBLIC_URL!;

const translateToBundlePath = (requestUrl: string) => {
  let maybe = requestUrl.startsWith(publicUrl)
    ? requestUrl.substr(publicUrl.length)
    : requestUrl;
  while (maybe.startsWith("/")) {
    maybe = maybe.substr(1);
  }
  return maybe || "index.html";
};
```

이 때 `PUBLIC_URL`은 environment variable로 주입하는 것이니 `serverless.yml` 파일에서도 반드시 잊지 말고 명시해주자.

```yaml
environment:
  PUBLIC_URL: ${env:PUBLIC_URL}
```

이제 모든 준비가 끝났으니 `serve` 함수를 만들 수 있다. [mime-types](https://www.npmjs.com/package/mime-types) package를 사용해서 `Content-Type`을 잘 판단해주고, Base64로 encoding할지의 여부도 잘 판단해주면 된다. 물론 CRA의 결과물로 나오는 파일들의 종류가 [아주 다양한 것은 아니기 때문에](#find-all-ext-of-built "find front/build | rev | cut -d'.' -f1 | rev | sort -u | grep -v '^/'") mimeType table을 직접 만들어서 사용해도 문제 없다.

```typescript
const NotFound = { statusCode: 404, body: "Not Found" };
const textTypes = [".css", ".html", ".js", ".json", ".map", ".svg", ".txt"];
const mimeHeader = (name: string) => ({
  headers: {
    "Content-Type": mime.contentType(name) || "application/octet-stream"
  }
});

export const serve: APIGatewayProxyHandler = async event => {
  if (!event.path) {
    return NotFound;
  }

  const requestPath = translateToBundlePath(event.path);
  const resource = resources[requestPath];
  if (!resource) {
    return NotFound;
  }
  const toBase64 = !textTypes.some(ext => requestPath.endsWith(ext));
  return {
    statusCode: 200,
    ...mimeHeader(resource.name),
    body: resource.getData().toString(toBase64 ? "base64" : "utf-8"),
    isBase64Encoded: toBase64
  };
};
```

그나마 이 방법을 사용할 수 있는건 [AWS API Gateway와 Lambda가 Binary response를 지원해주기 때문](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings.html) 인데, 그럼에도 모든 binary 데이터를 메모리에 다 올려서 base64로 응답하는 방법이 참 꺼림직하다. 물론 이 글의 취지는 어디까지나 React.js로 개발된 간단한 frontend 페이지를 Serverless stack과 같이 배포하는 것이므로, 만약 큰 이미지를 포함하게 될 일이 있다면 다시 S3 + CloudFront를 사용한 배포를 고려해야 하다. API Gateway는 비싸다.

게다가 코드만 작성해서 모든 것이 해결되면 아주 좋겠지만 [공식 문서](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-payload-encodings.html)에 따르면 [`API Gateway`의 `binaryMediaTypes`을 지정](https://serverless.com/blog/framework-release-v142/#binary-media-type-responses)하거나 [`Integration Lambda Proxy`의 `contentHandling` 값을 지정](https://www.npmjs.com/package/serverless-apigwy-binary)해주어야 한다.

`binaryMediaTypes`는 Serverless framework에서 지난 5월부터 공식으로 지원하고 있다. 외부 plugin을 추가로 쓰는 것보다 내장된 것을 쓰는게 더 기분 좋으니 이 설정을 사용해보자. 물론 가끔 뭐가 잘못된건지 잘 안 될 때가 있는데 이 때에는 `binaryMediaType`을 `*/*`으로 설정해놓고 확인해보면 좋다. 여기서는 image에 대한 처리만 하면 되니 `image/*`로 설정하면 된다.

```yaml
provider:
  apiGateway:
    binaryMediaTypes:
      - "image/*"
```

마지막으로 API Gateway의 entrypoint를 설정해주어야 한다. 다음과 같이 URL pattern을 최대한 맞춰서 설정하면 잘못된 요청에 대해서는 Lambda까지 거치지 않고 404를 반환하고 이에 대한 요금이 부과되지 않기 때문에 요금 방어에 티끌같은 도움을 줄 수 있다. 물론 `react-router` 같은걸 사용해야 해서 URL을 특정짓기 어렵다면 `http: GET /{file*}`과 같이 설정해서 한 번에 모든 경로를 다 받도록 설정할 수도 있다.

```yaml
serve:
  handler: handler.serve
  events:
    - http: GET /
    - http: GET /{file}
    - http: GET /static/css/{file}
    - http: GET /static/js/{file}
    - http: GET /static/media/{file}
```

`serve`를 위한 API path mapping이 굉장히 넓게 잡힐 수 있기 때문에 원래 제공하려고 했던 API는 저 함수 위에 선언해야 한다. 그래야 일단 API의 path에 맞는 것이 먼저 선택되어 실행되고, 그렇지 않은 경우에 `serve` 함수가 실행될 수 있다.

### local에서 테스트

`serverless-offline` plugin을 사용하면 local에서 테스트할 수 있다.

```yaml
# yarn add -D serverless-offline
plugins:
  - serverless-webpack
  # serverless-offline needs to be last in the list
  - serverless-offline
```

serverless-offline은 `/STAGE`가 아니라 `/`로 routing하기 때문에 `--prefix` 옵션을 사용해서 실제 배포 이후와 동일한 URL 형태가 되도록 맞춰주어야 테스트하기 좋다.

```bash
sls offline --prefix ${STAGE}
```

이제 browser에서 `http://localhost:3000/dev/`로 접근하면 CRA로 만든 결과물이 잘 전달되는 것을 확인할 수 있다.

### 배포

AWS Credentials를 잘 설정하고 `sls deploy`를 통해 배포하면 된다. 배포 후에 나오는 `endpoint`를 browser로 접속해서 페이지가 제대로 나온다면 성공이다.

### Throubleshooting

가끔 어딘가 설정이 어긋나면 binary data가 제대로 전달되지 않는 경우가 있어 이미지가 깨지는 등의 현상을 보일 때가 있다. 이는 png를 받아가기는 하는데 invalid image type 등으로 해석에 실패하는 것으로 dev console을 통해 확인할 수 있다.

분명 하란대로 했는데 잘 안 되는 경우인데 이게 CloudFormation을 통해 작성한 것도 아니고 Serverless framework을 통해서 AWS를 제어한 것이므로 대체 어디가 잘못된 것인지 찾기가 힘든 경우가 있다. 처음에 이 글을 쓰면서 정리할 때 이 문제를 겪다가 결국 [Use Serverless Lambda API Gateway for Binary Response](https://theleakycauldronblog.com/blog/use-serverless-lambda-api-gateway-for-binary-response/) 글에서 이야기하는대로

- RestApi에 OpenApi 규격으로 `binaryMediaTypes`를 설정하는 `serverless-apigw-binary` 플러그인을 사용해 `image` mime-type을 설정하고
- Lambda에 `contentHandling`을 설정할 수 있게 해주는 `serverless-apigwy-binary` 플러그인을 사용해 `CONVERT_TO_BINARY`를 설정해서

겨우 성공했었다. 하지만 뭔가 이상함을 느끼고 하나씩 지우고 결국 Serverless framework의 `binaryMediaTypes` 만으로도 충분히 잘 동작한다는 것을 알아서 결국 그 쪽으로 내용을 정리했지만 만약 잘 설정한 것 같은데 계속 이상하게 동작한다면 이 방법도 고민해보는 것이 좋지 않을까 싶다. ~~하지만 아무리 봐도 하는 일이 동일한데 왜 처음에는 안 되었는지 아직도 모르겠다.~~

### 마무리

취미로 개발하거나 잉여톤을 진행하면서 개발하는 다양한 Serverless API를 지인들에게 공유할 때마다 늘 curl로 요청하는 방법을 같이 공유했고 덕분에 번번히 영업에 실패했던 것 같다. 이제 React.js로 만든 좀 예쁘고 쉽게 확인해볼 수 있는 페이지를 제공해서, API에 대한 기능을 간단하게 설명하거나 혹은 그 기능에 대한 운영툴을 만들어서 같이 배포하면 영업 성공률이 좀 더 올라가지 않을까 싶다. 이런 행복회로를 돌리면서 당분간은 예전에 API만 배포된 서비스들에 예쁜 UI를 붙여주는 작업을 진행할 것 같다.
