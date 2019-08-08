---
title: API Gateway의 인증을 위한 Custom Authroizer 사용하기
tags: ["aws", "serverless", "auth"]
---

API Gateway와 Lambda Proxy를 사용하여 간단한 HTTP/s API나 WebSocket API를 구축할 수 있다. AWS CloudFormation을 직접 사용하여 서비스를 구성할 수도 있고, 최근에 나온 [aws-cdk](https://docs.aws.amazon.com/cdk/latest/guide/home.html)을 사용하여 구성할 수도 있다. 물론 [Serverless framework](https://serverless.com)과 같이 vendor 종속적이지 않은 framework을 사용할 수도 있다. 어느 쪽을 사용하든 [각각이](https://github.com/lucpod/aws-lambda-workshop/tree/master/lessons/01-simple-hello-world-api) [제공하는](https://serverless.com/framework/docs/providers/aws/examples/hello-world/) template을 이용하면 _Hello world_ 를 출력하는 HTTP/s API를 만드는데에 많은 시간이 필요하지 않다. ~~물론 처음일 경우, AWS 가입과 [credential](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-credentials.html) 등의 개발 환경의 설정에 많은 시간이 소요될 수 있다.~~

_Hello world_ 를 출력하기 위한 구조, Lambda의 코드가 어디에 올라가서 어떻게 배치되고 API Gateway가 어떤 gateway를 구성하며 그 둘이 어떻게 proxy로 설정되어 HTTP event를 받아 처리할 수 있는지, ~~나중에 기회가 되면 정리해보겠지만~~ 이미 각 시스템마다 훌륭한 글이 많이 있다.

- [AWS Serverless getting started](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-getting-started-hello-world.html)
- [AWS Serverless Application Model](https://github.com/awslabs/serverless-application-model)
- [Hello world from Serverless framework](https://serverless.com/framework/docs/providers/aws/examples/hello-world/)

어쨌든 구조를 간단히 이해하고 그 안에 로직을 추가하여 그럴싸한 서비스를 구축하는 것은 금방이다. 물론 단순히 API Gateway와 Lambda만으로 설명되는 서비스가 아니라 외부 자원이 필요한 서비스인 경우, 예를 들면,

- S3를 사용하여 파일을 보관하거나 교환한다거나
- CloudFront를 사용하여 S3에 저장된 파일을 static web site로 서비스할 수 있어야 한다거나
- SQS에 어떤 요청을 넣고 그 요청을 다른 서비스에서 처리할 수 있게 한다거나
- MySQL이나 DynamoDB 등의 데이터베이스를 사용하는 서비스를 구축한다거나

할 경우에는 각 자원에 대한 선언을 CloudFormation으로 해준다거나, 혹은 AWS Management console에서 작업한 후 환경 변수나 AWS SSM으로 공급해 사용할 수 있도록 만들어주어야 하므로 조금 더 신경써야 하는 부분이 있다. 하지만 본 내용에서는 _그건 이미 다 했거나 혹은 할 필요가 없다고 가정하고_, 그렇게 만들어진 서비스의 **인증** 부분을 작성하는 방법을 알아보도록 하겠다.

## API Gateway의 Authorizer

API Gateway로 들어오는 요청에 대한 인증을 처리하기 위한 방법은 3가지가 있다.

- [token 기반의 Lambda authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html#api-gateway-lambda-authorizer-token-lambda-function-create)
- [request 기반의 Lambda authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html#api-gateway-lambda-authorizer-request-lambda-function-create)
- [AWS Cognito user pool을 사용하는 authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)

[AWS Cognito](https://aws.amazon.com/cognito/)는 유저 관리와 인증에 대한 많은 부분을 처리해주는 서비스로 기능도 많고 알아야할 것도 많다. 하지만 제대로 된 서비스를 운영하는 것이 아니라 간단한 개인 프로젝트를 진행할 때 사용하기에는 너무 알아야 할 것도 많고 관리할 것도 많아서 차라리 직접 만든다고 해도 좀 더 간단한 무언가를 쓰는 것이 낫다는 생각이 든다. 때문에 Cognito는 잠시 접어두고 Lambda authorizer로 아주 간단한 수준의 authorizer를 만드는 쪽을 선택하게 되었다.

[![Custom auth workflow](https://docs.aws.amazon.com/apigateway/latest/developerguide/images/custom-auth-workflow.png)](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html)

AWS 문서의 공식 그림인데 이 그림이 모든 것을 설명해준다.

- API Gateway가 client로부터 요청을 받으면, token이냐 request냐에 따라 _적절한 정보를 추려서_ `auth function`을 실행해준다.
- `auth function`이 `Allow`나 `Deny` 여부를 포함하는 [`policy document`](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html)를 반환하면 [authorizer 설정에 따라 그것을 cache](https://docs.aws.amazon.com/apigateway/latest/developerguide/configure-api-gateway-lambda-authorization-with-console.html)한다. 이는 동일한 auth 정보에 대해 `auth function`을 또 실행하지 않도록 해준다. 즉 비용 절감이 된다.
- _allow_ 가 되면 API Gateway의 HTTP event를 받을 Lambda나 EC2 endpoint가 호출된다.

마치 http server framework의 security middleware처럼 router에 의해 request에 대한 handler가 호출되기 전에 미리 request 내의 auth 정보를 보고 요청을 drop하는 (빠르게 4xx로 응답해버리는) 과정과 같다. 재미난 점은 `auth function`이 만들어진 policy가 cache될 수 있다는 점이고, 덕분에 `auth function`의 lambda call 비용을 절약할 수 있을 뿐만 아니라, `Deny` policy가 cache되었을 경우 API Gateway는 `auth function`도, proxy endpoint도 부르지 않고 응답을 해버리는데 [이 때 비용이 부과되지 않는다는 것이다.](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-pricing.html)

> Calling methods with the authorization type of `AWS_IAM`, `CUSTOM`, and `COGNITO_USER_POOLS` are not charged for authorization and authentication failures.

이는 비용 최적화 측면에서 꽤 유리한데,

- 정상적인 상황에서도 모든 lambda handler가 auth를 수행하기 위한 시간을 소모하지 않고 하나의 `auth function`을 공유하는 여러 handler에 대해 `auth function`의 policy가 cache되어 auth cost를 1회로 줄일 수 있고,
- 그마저도 `auth function`에서 JWT의 `verify` 만 수행한다면 매번 DB 등의 서버 측 state를 확인하는 것에 비해 최소한의 비용으로 인증이 가능할 것이고,
- 잘못된 인증을 요구하는 경우에도 1회 수행 이후 cache된 deny policy에 의해 API Gateway 비용조차 부과되지 않으므로 ~~간단한~~ 공격에 대해서는 어느 정도 비용 방어가 될 수 있겠다.

물론 무작위 인증 토큰을 포함하는 DDoS의 공격은 이 수준으로 방어하기는 어려운데 이 때에는 [WAF](https://aws.amazon.com/waf/)를 사용해서 _진지한_ 방어를 고민해야겠다. 그래도 예전처럼 API Gateway + Lambda proxy의 2-tier 모델보다는 공격 상황에서도 어느 정도 비용 방어가 되기 때문에 인증이 필요한 서비스의 구축이 필요하다면 Lambda auhtorizer는 유의미한 선택이라 할 수 있다.

## Lambda Authorizer

token 기반의 인증과 request 기반의 인증의 큰 차이점은 `auth function`에서 받는 [`event`에 포함된 정보](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html)이다. 둘 다 어떤 method를 실행하려 했는지는 `event.methodArn`을 통해 받을 수 있지만 인증에 필요한 정보를 어느 정도로 추려주느냐에서 차이가 있다.

- token 기반은 [HTTP Authorization](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication)으로 전달되는 정보만 `event.authorizationToken`로 넘어온다.
- request 기반은 `HTTP header`, `queryString`, `pathParameters`, `stageVariables` 정보를 받을 수 있다. 때문에 token 기반을 사용할 때 받을 수 있는 정보를 포함하여 거의 대부분의 HTTP 요청 정보를 받을 수 있다고 볼 수 있다.

Basic authentication을 사용하여 인증을 진행할 때에는 _token 기반_ 의 인증으로도 충분하다. `HTTP Authorization` header에 필요한 정보가 모두 포함되어있기 때문이다. 물론 이 예제는 HTTP/s API를 사용하기 때문에 token과 request 두 방식 모두 사용할 수 있어서 선택이 가능하고, 만약 **WebSocket API를 사용하는 경우는 request 기반만 사용할 수 있으므로 이 점에 주의해야 한다.**

Basic authentication으로 전달되는 id와 password가 올바르다면 이에 대한 session을 유지해야 하는데 이를 위해 따로 서버에서 state를 관리하고 싶지는 않으므로 좀 더 편한 방식인 [JWT](https://en.wikipedia.org/wiki/JSON_Web_Token)를 사용할 것이다. 이를 [HttpOnly, Secure Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#Secure_and_HttpOnly_cookies)로 전달해서 추후 인증에서도 사용하도록 할 수 있지만 여기서는 token 기반의 인증을 사용하므로 이 JWT 값도 `HTTP Authorization` header의 [`Bearer` scheme](https://tools.ietf.org/html/rfc6750)으로 전달하도록 한다. 이제

- JWT를 발급할 수 있는 login API와
- 그 이후에 접근할 수 있는 간단한 API와
- 그 인증을 해줄 수 있는 auth function을

만들어보도록 하겠다. [전체 예제는 이 쪽에서 확인해볼 수 있다.](https://github.com/lacti/serverless-custom-authorizer-example)

### Login API

[HTTP Basic authentication](https://tools.ietf.org/html/rfc7617)을 사용한다고 하면 인증 요청은 다음과 같이 HTTP Header로 전달된다.

```yaml
Authorization: Basic BASE64("id:password")
```

이를 위해 `delimiter`를 기준으로 앞뒤를 나누는 함수와 base64를 decode하는 함수를 먼저 만들어둔다.

```typescript
const splitByDelimiter = (data: string, delim: string) => {
  const pos = data ? data.indexOf(delim) : -1;
  return pos > 0 ? [data.substr(0, pos), data.substr(pos + 1)] : ["", ""];
};

const decodeBase64 = (input: string) =>
  Buffer.from(input, "base64").toString("utf8");
```

이제 `login API`를 작성할 수 있다. 이 함수는 일반 HTTP/s API이므로 `APIGatewayProxyEvent`의 `headers`로부터 `Authorization` 값을 가져와서 id와 password 부분을 얻어낸 후 비교하고, 기대된 값이면 JWT를 발급하여 반환한다. JWT를 발급하는 것은 [라이브러리](https://github.com/auth0/node-jsonwebtoken)를 사용해서 간단하게 수행할 수 있다.

```typescript
const jwtSecret = "verySecret";
const admin = {
  id: "test",
  password: "1234"
};

export const login: APIGatewayProxyHandler = async event => {
  const [type, data] = splitByDelimiter(event.headers["Authorization"], " ");
  const [id, pw] = splitByDelimiter(decodeBase64(data), ":");

  const accepted = type === "Basic" && id === admin.id && pw === admin.password;
  if (!accepted) {
    return {
      statusCode: 401,
      body: "Unauthorized"
    };
  }
  const token = jwt.sign({ id }, jwtSecret, { expiresIn: "30m" });
  return {
    statusCode: 200,
    body: JSON.stringify({ token })
  };
};
```

정상적인 요청이라면 JWT가 반환되고 그렇지 않다면 401 응답이 반환될 것이다.

### Auth function

이제 이후에는 생성된 JWT로만 요청을 하게 될 것이므로 이 토큰의 유효성을 검증하는 `auth function`은 간단하게 작성할 수 있다. 이 token은 [Bearer Authorization](https://tools.ietf.org/html/rfc6750)으로 전달되므로 그 값을 받아 [라이브러리](https://github.com/auth0/node-jsonwebtoken)로 유효성을 검사한다.

```typescript
export const auth: CustomAuthorizerHandler = async event => {
  const [type, token] = splitByDelimiter(event.authorizationToken, " ");
  const allow = type === "Bearer" && !!jwt.verify(token, jwtSecret);
  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: allow ? "Allow" : "Deny",
          Resource: event.methodArn
        }
      ]
    }
  };
};
```

token의 유효성 여부에 따라 허가 여부를 결정해서 Policy를 만들어주면 된다. 이 때 Resource에 범위를 적절히 설정해주어야 하는데, **이 예제는 간단해서 요청한 `methodArn`을 그대로** 전달한다. 물론 API가 여러 개일 경우 단일 Resource를 포함하는 allow policy가 여러 개 생성되거나 범위 Resource를 포함하는 allow policy가 생성되어야 한다. 그렇지 않으면 **X API를 요청할 때 만들어져 cache된 policy로 Y API를 요청할 때에도 사용하게 되므로 `Resource`가 맞지 않아 제대로 허용되지 않을 수 있다.**

이를 위해 간단히 policy의 cache를 끄는 방법도 있지만 이 경우 `auth` handler가 매번 실행되므로 비용이나 성능 최적화 측면에서 손해를 보게 된다. 때문에 `event.methodArn`을 적절히 사용하여 범위로 허용해 줄 수 있도록 사용해야 한다.

#### Allow many functions

`methodArn`의 규격은 다음과 같으므로 `stage`와 `httpVerb`를 적당히 `*`로 정해주면 되겠다.

```text
arn:aws:execute-api:{regionId}:{accountId}:{apiId}/{stage}/{httpVerb}/[{resource}/[{child-resources}]]
```

```typescript
const [, , , region, accountId, apiId, stage] = event.methodArn.split(/[:/]/);
const scopedMethodArn =
  ["arn", "aws", "execute-api", region, accountId, apiId].join(":") +
  "/" +
  [stage, /* method= */ "*", /* function= */ "*"].join("/");
```

새롭게 만들어진 `methodArn`은 이번 요청에 수행될 Lambda function 뿐만 아니라 다른 httpVerb의 resource도 실행 가능하도록 `*`으로 넓게 지정되었다. 이제 이 policy가 cache될 것이고 다른 httpEndpoint가 호출되어도 범위로 지정된 `methodArn`에 의해 Lambda 수행 허가가 문제 없이 이루어질 것이다.

물론 이렇게 간단히 `*`로 지정하기 어렵고 매번 `auth function`이 판단을 해야 하는 경우도 있다. 이 경우는 오히려 policy cache를 사용하지 않도록 설정해야 하는데 `Serverless framework`에서는 `resultTtlInSeconds`를 `0`으로 지정하면 된다.

```yaml
authorizer:
  name: auth
  resultTtlInSeconds: 0
```

### Hello API

이제 테스트를 위해 사용할 간단한 GET API를 만들어둔다. 이 함수는 `auth function`이 `allow policy`를 반환할 경우 불리게 된다.

```typescript
export const hello: APIGatewayProxyHandler = async event => {
  return {
    statusCode: 200,
    body: JSON.stringify(event)
  };
};
```

### serverless.yml

이제 작성한 함수들을 배포될 수 있도록 `serverless.yml`에 등록한다. `login API`는 `auth` 없이 늘 하던대로 등록하면 되고, `auth function`로 Lambda로 배포될 수 있도록 `functions`에 추가해준 뒤, `hello API`의 `http.authorizer`에 `auth`를 연결해주면 된다.

```yaml
service:
  name: hello-custom-authorizer

plugins:
  - serverless-webpack

provider:
  name: aws
  runtime: nodejs10.x
  region: ap-northeast-2

functions:
  login:
    handler: handler.login
    events:
      - http:
          method: post
          path: login
  auth:
    handler: handler.auth
  hello:
    handler: handler.hello
    events:
      - http:
          method: get
          path: hello
          authorizer: auth
```

## 테스트

배포하면 `https://API-ID.execute-api.REGION.amazonaws.com/dev/` 하위에 `login`과 `hello` API를 얻을 수 있다. 이제 로그인을 수행하려면 다음과 같이 curl을 사용할 수 있다.

```bash
$ curl -XPOST "https://test:1234@API-ID.execute-api.REGION.amazonaws.com/dev/login"
{"token":"JWT"}
```

이제 얻어낸 JWT 값을 사용하여 `hello API`를 요청할 수 있다.

```bash
$ curl -XGET -H "Authorization: Bearer JWT-FROM-RESPONSE" "https://API-ID.execute-id.REGION.amazonaws.com/dev/hello"
{"resource":"/hello","path":"/hello","httpMethod":"GET","headers":{"Accept":"*/*","Authorization":"Bearer TOKEN-FROM-RESPONSE",...},...}
```

만약 token 없이 요청한다면 _401 Unauthorized_ 응답을 받게 된다.

```bash
$ curl -v -XGET "https://API-ID.execute-id.REGION.amazonaws.com/dev/hello"
...
< HTTP/2 401
< content-type: application/json
< content-length: 26
...
{"message":"Unauthorized"}
```

## 정리

- Basic authentication으로 요청된 id와 password로부터 JWT를 생성하는 `login API`와
- 발급된 JWT를 verify해서 적절한 resource 범위의 policy를 생성하는 `auth function`을 만들면,
- 인증이 필요한 API를 구성할 때 위 `auth function`을 `authorizer`로 연결해서 사용할 수 있게 된다.

Serverless로 구성된 간단한 데이터베이스 등 개인 프로젝트를 진행할 때에도 API들을 인증으로 보호해야 하는 경우가 있는데 이제 위 방법을 사용해서 간단한 인증 체계를 구성할 수 있다. id나 password, 혹은 token을 환경 변수로 관리해서 특정 유저만 허용해도 좋고 필요하다면 S3에 인증 정보를 넣어두고 불러와서 사용해도 되겠다.
