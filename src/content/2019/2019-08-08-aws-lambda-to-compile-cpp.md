---
title: AWS Lambda로 cpp 파일 컴파일
tags: ["aws", "serverless", "lambda"]
shortdesc: "Lambda에서 cpp 파일을 컴파일해보자."
---

프로그래밍 동아리에 있던 대학교 시절, 으레 남들 하는 것처럼 동아리 내 문제풀이 채점 서버를 만든다고 나섰던 적이 있다. 그 당시 내가 알고 있는 지식을 최대한 사용해서 만들었지만 잘못된 가정과 부족한 지식으로 인해 서버는 금새 응답 불가 상태가 되었고 덕분에 운영을 맡았던 친구들이 제출된 코드를 손으로 채점해서 결과를 알려주는 슬픈 일이 발생했었다. 잘못 가정한 것은, 어찌보면 너무나 당연한 잘못인데, "컴파일과 실행/채점이 충분히 빨리 끝난다" 는 것이었다. 당시 채점 서버를 하나만 두었기 때문에 이 가정을 조금이라도 어기는 좋지 않은 코드가 제출되면 다른 사람들의 제출조차 막혀버리는 문제가 발생했던 것이다.

[백준 온라인의 저지의 10년 개발 이야기](https://startlink.blog/category/스타트링크/baekjoon-online-judge/boj-10-years/) 글에 나와있는 구조처럼, 적어도 queue를 두어 시스템을 분리하고 throttling을 할 수 있어야 하고, 서버가 분산될 수 있으므로 적절한 storage를 두어 state를 공유할 수 있어야 하겠다. 어쨌든 이것저것 좀 많이 경험해본 지금이야 좀 더 나은 구조로 서비스를 구축할 수 있을 것 같은데 그럴 기회도 명분도 다시오지 않아 가끔 이 주제가 생각날 때마다 씁쓸함이 있다.

하지만 최근 잉여하면서 남는게 시간이고, 절제된 요금의 서버리스 영업을 한창 하는 중이니, `queue + storage + worker-pool`의 정상적인 방법 말고, 서버리스로 이 구조를 설계해보고 그 중 핵심(?)에 속하는 컴파일 부분을 AWS Lambda를 통해 실행하는 방법을 정리해보도록 하겠다. 물론 서버리스는 AWS의 것을 쓸 것이다.

### 채점 시스템 구조

간단한 유저 시나리오를 적어보면, 유저는,

- `GET /{problemId}`해서 문제를 얻어가고,
- `PUT /{problemId}?language=<language>`의 Body로 소스코드를 제출할 것이다.
  - 제출된 소스코드를 지정된 언어 런타임으로 빌드해서
  - 해당 문제의 입출력을 대입하여 결과를 확인하고
  - 그 결과, 성공 실패 혹은 metric 정보를 적절한 방법으로 유저에게 전달한다.

이를 위해 적어도 시스템은,

1. _문제_ 와 _채점을 위한 입출력_ 데이터를 보관하는 저장소와
2. 만약 필요하다면 _채점 결과_ 를 잠시 보관하는 저장소
3. 그리고 문제를 유저에게 전달하기 위한 웹 서버와 로직
4. 그리고 제출된 코드를 받아서 빌드와 채점을 수행하기 위한 웹 서버와 처리기가 필요하다.

잘 알고 있는 종래의 방법을 사용한다면, 1) 2)를 위해 적당히 `MySQL` 같은걸 쓰고 3) 4)를 위해 적당히 `nginx`에 `nodejs`, 그리고 queueing과 임시 값 저장을 위해 `Redis` 등을 사용해볼 수 있을 것이다. ~~그리고 이를 위한 서버를 요청이 없을 때에도 계속 켜놓기 위해 지속적으로 요금을 지불하게 될 것이다.~~

서버리스로 생각해보자. 1)은 잘 변경되지 않는 static 데이터이니 `S3`를 사용하고 3)은 `API Gateway`와 `AWS Lambda` proxy로 간단히 할 수 있겠다. 2)와 4)는 사실 한통속인데, 만약 _문제의 수행시간 제약을 강하게 주어서_ 모든 입출력 경우에 대해 _20초 내에_ 채점이 가능하다면 2)를 고민하지 않고 4) 역시 `API Gateway`와 `AWS Lambda` proxy로 처리할 수 있다.

`API Gateway`의 이벤트를 처리하는 `AWS Lambda`의 경우 Timeout Limit가 30초인데, 이 중 10초를 빌드를 위한 외부 런타임 설정과 실제 코드 빌드에 사용한다고 치고, 남은 20초 동안 열심히 채점을 하면 임시 state를 고민하지도 않고 단순히 WebAPI로 빌드와 채점을 처리할 수 있다는 것이다.

이 글에서는 이 부분에 초점을 맞추어, **AWS Lambda에서 단일 cpp 파일을 빌드하기 위해 외부 런타임을 같이 배포하고 사용하는 방법에 대해서 정리할 것이다.**

### 외부 런타임을 로컬에서 테스트하기

Lambda는 [firecracker-microvm](https://github.com/firecracker-microvm/firecracker)으로 관리되는 vm으로 [각 런타임에 따라 Java, Python, go, NodeJS 등의 language 런타임이 포함](https://docs.aws.amazon.com/lambda/latest/dg/lambda-런타임s.html)되어 있다. 이는 [amazonlinux](https://hub.docker.com/_/amazonlinux) 기반으로 만들어진 것으로 만약 local에서 테스트할 필요가 있다면 [lambci/lambda](https://github.com/lambci/docker-lambda)로 적절한 런타임을 골라서 docker로 테스트해볼 수도 있다.

가끔 풀어야 하는 문제가 특정 언어의 런타임으로는 부족할 때가 있다. 예를 들면 [은전한닢](http://eunjeon.blogspot.com/)을 사용해서 간단한 tokenizing을 수행한다거나 아니면 이 글처럼 cpp를 빌드하기 위해 gcc를 실행한다거나 할 때다. 만약 실행할 외부 런타임이 간단한 구조라면, 예를 들어 golang으로 작성된 것이라면 추가로 필요한 so 파일 등의 의존성이 없도록 static build를 해서 깔끔하게 그 binary를 Lambda code zip에 같이 배포해서, NodeJS의 경우 `child_process`를 사용해서 실행하면 된다. 하지만 수많은 데이터 파일과 심지어 `.so` 파일에 의존하고 있는 경우에는 이 모든 의존하는 파일들을 잘 찾을 수 있도록 위치를 잘 정리해준뒤 모두 같이 code zip에 포함시켜서 Lambda에 올려주어야 한다.

정리해보면,

- 가급적이면 static build를 해서 의존성이 없도록 만들고: 주로 [ffmpeg on AWS Lambda](https://intoli.com/blog/transcoding-on-aws-lambda/)로 많이 찾아볼 수 있다. 물론 ffmpeg의 경우 static build를 제공하기 때문에 몇몇 libav를 제외하면 간단하게 Lambda에서 사용할 수 있다. NodeJS의 경우 [ffbinaries](https://www.npmjs.com/package/ffbinaries)를 쓰면 아주 간단하다.
- 만약 필요하면 의존 파일들을 모두 적절한 위치에 구성해서 잘 실행될 수 있도록 묶어주고: 이 때 사용하면 아주 좋은 도구로 [exodus](https://github.com/intoli/exodus)가 있다. [musl-gcc](https://www.musl-libc.org/)라도 쓰지 않는한 아무리 static build를 해도 몇몇 `.so`는 의존성이 남는 경우가 있는데 이 도구를 사용하면 그런 의존 파일들을 모두 잘 추려서 **symlink** 로 적절히 실행될 수 있는 구조를 만들어준다.
- 데이터 파일들도 상대 경로로 잘 찾아질 수 있도록 구성해야 한다: 만약 배포하려는 프로그램이 무조건 절대 경로를 사용한다면 문제가 크다. Lambda에서 writable한 storage는 오로지 `/tmp` 뿐이기 때문이다.

이렇게 만들어진 외부 런타임 파일이 AWS Lambda 환경에서도 정상적으로 실행 가능한지 확인해보려면 [amazonlinux](https://hub.docker.com/_/amazonlinux)을 사용하면 된다. 예를 들어 [`musl-gcc`](https://www.musl-libc.org)를 확인해보고 싶다면 미리 [`x86_64-linux-musl-native.tgz`](https://musl.cc)를 받아 압축을 풀고 다음과 같이 확인해 볼 수 있다.

```bash
$ docker run -it -v $PWD/x86_64-linux-musl-native:/opt amazonlinux:2 /bin/sh

$ cat > hello.c << EOF
#include <stdio.h>
int main(int argc, char **argv)
{ printf("hello %d\n", argc); }
EOF
$ musl-gcc -static -Os hello.c
$ ./a.out
hello 1
```

만약 무언가 에러가 발생한다면

- 경로가 잘못되었거나
- 필요한 파일이 누락되었거나
- 아니면 있는데 찾을 수 없게 환경 변수가 누락되었거나
- 혹은 target platform이 적절하지 않은 파일을 가져왔을 때이다.

native 개발하던 경험을 살려서 문제를 차근차근 해결해보자.

### AWS Lambda에서 외부 런타임을 실행하기

외부 런타임이 `amazonlinux` docker에서 잘 실행이 된다면 반은 성공한 것이다. AWS Lambda에서도 그게 올바르게 실행되기 위해서는 적어도 3가지를 조심해야 하는데,

- [AWS Lambda의 용량 제한은 얼마인가](https://docs.aws.amazon.com/lambda/latest/dg/limits.html)
- 이 외부 런타임을 실행하기 위한 플랫폼이 일치하는가
- container의 제약 조건이 충분히 너그러워서 외부 런타임을 실행할 수 있는가

용량 제한은

- Lambda 배포 시 올리는 code zip으로 부터 생성되는 readonly storage인 `/var/task`는 최대 250MB,
- 임시 공간으로 사용할 수 있는 `/tmp`는 최대 512MB이다.

때문에 일반적으로 `/var/task`에 실행 관련 파일을 올리고, 추가로 필요하면 `/tmp` 등에 라이브러리를 올려서 사용할 수 있도록 구성하고, `/tmp`에 임시 파일이나 데이터 파일을 두고 사용하게 된다. `/tmp`는 Lambda instance가 재사용되면 예전에 썼던 파일이 남아있게 된다.

numpy나 TensorFlow처럼 라이브러리의 용량 자체가 어마무시한 경우에는 `/var/task`만의 용량으로는 한계가 있어 `/tmp` 밑에 일부 라이브러리를 넣은 후 `sys.path`에 추가해서 사용하는 경우가 있다. 이 때 `/tmp`에 필요한 파일을 넣어두는 데에도 꽤나 큰 시간이 필요하기 때문에 이를 단축시키기 위한 방법을 고민해야 할 수도 있다. 물론 대부분의 경우 `/tmp`가 재사용될 수 있다는 점에 착안하여 Lambda를 `warmUp`하는 방법을 사용하고, 이를 위한 Serverless 플러그인으로 `serverless-plugin-warmup`이 있다.

용량처럼 구체적인 제약은 문제가 발생할 때 눈치채기 쉬운 편이다. 정확히 명시되지 않은 제약 조건으로 인해 문제를 로컬의 `amazonlinux` 테스트는 문제 없었는데 `Lambda`에 올린 이후에 실행이 되지 않을 수 있다. `amazonlinux`는 docker image로 제공되는 것이므로 Lambda의 몇 가지 플랫폼 이슈를 사전에 확인할 수 없는 문제가 있는데 예를 들어 대표적으로 [`/dev/shm`을 사용할 수 없는](https://forums.aws.amazon.com/thread.jspa?threadID=219962) 문제가 있다. 이 때문에 로컬 테스트를 하고 나서도 반드시 간단한 Lambda를 만들어 배포해서 실제 환경에서도 정상 동작하는지 확인해야 한다. 모든 시스템을 다 구성한 후에 외부 런타임이 제대로 실행될 수 없다는 것을 깨달으면 너무나도 슬프다.

### musl-gcc

cpp 파일을 컴파일하기 위해 제일 먼저 생각해볼 수 있는 것은 `gcc`일 것이다. 하지만 이는 용량이 너무 크기 때문에 Lambda에 올리기는 어려워 보인다. 필요한 파일만 `inotifywait` 등으로 추려서 올리는 것도 방법이겠지만 다행히 그보다는 좀 더 쉬운 방법이 있다. golang에서 주로 사용한다고 알려진 [`musl-gcc`](https://www.musl-libc.org)를 이용하는 것이다. 게다가 이 툴은 [커뮤니티에서](https://musl.cc) [package로 잘 구성된 170MB의 cc toolset](https://musl.cc/x86_64-linux-musl-native.tgz)을 제공하므로 따로 static build를 만든다고 고생할 필요가 없다. 물론 그래도 잘 동작하는지 위에서 이야기한 것처럼 `amazonlinux` docker container를 하나 띄워서 사용해보면 된다.

```bash
$ docker run -it -v $PWD/x86_64-linux-musl-native:/opt amazonlinux:2 /bin/sh
# ... 동일한 내용 생략 ...
```

이 글을 쓰는 당시 `x86_64-linux-musl-native.tgz` 내의 `lib/libc.so`의 symlink가 잘못 만들어져 static build가 아닐 경우 `libc`를 찾지 못해서 실행이 안 되는 문제가 있었다. 이 위치를 제대로 수정해주면 굳이 static build를 수행하지 않아도 되겠지만 설명의 단계를 줄이기 위해서 이 글에서는 Lambda 내에서 빌드를 할 때에는 계속 static build를 가정하도록 하겠다.

### 초기 기동 시간 고찰

그럼 이 파일을 Lambda로 배포해서 사용하려면 어떻게 해야 할까?

a. Lambda가 처음 실행될 때 `/tmp`에 `x86_64-linux-musl-native.tgz` 파일을 다운로드하고, 압축을 풀어서 사용한다.
b. `x86_64-linux-musl-native.tgz` 파일을 code와 함께 압축해서 `/var/task`에 풀릴 수 있도록 해놓고, Lambda가 처음 실행될 때 `/var/task`에서 가져다가 `/tmp`에 압축을 풀어서 사용한다.
c. `x86_64-linux-musl-native.tgz` 압축을 풀어서 code와 잘 섞고, 잘 실행할 수 있도록 구성한 후, code와 함께 압축해서 `/var/task`에 풀릴 수 있도록 해놓고 handler에서는 `/var/task`에 위치한 `musl-gcc`를 사용하도록 한다. 물론 위에서 이야기했던 것처럼 `/var/task`는 readonly storage이므로 이렇게 풀린 파일들에게 executable permission을 줄 수 없다. 때문에 symlink는 어떻게 처리할 수 있어도 실행할 수가 없다.
d. c)의 방법과 비슷하지만 `/var/task`에 풀린 `musl-gcc` 파일들을 `/tmp`에 복사한 후, executable permission만 주어서 사용한다.

복잡도로 보면 a)가 제일 간단하고, d)가 제일 복잡하다. 그리고 당연하게도 d)의 속도가 제일 빠르다. 일단 걸린 시간을 정리해보면 다음과 같다.

| 실험 | 방법 | 총 시간 | 준비 시간 | 메모리 크기 | 비고                                                             |
| ---- | ---- | ------- | --------- | ----------- | ---------------------------------------------------------------- |
| 가   | a)   | -       | -         | 1G          | `musl.cc` 다운로드 사이트가 너무 느리다.                         |
| 나   | b)   | 9초     | 7초       | 1G          |                                                                  |
| 다   | d)   | 6초     | 4초       | 1G          | `usr`에 대한 symlink를 제거하고 `include`를 `usr/include`로 복사 |
| 라   | d)   | 5초     | 3초       | 1G          | `include` 디렉토리의 중복된 파일 제거                            |
| 마   | d)   | 4초     | 2초       | 2G          | 파일 복사만 하고 `chmod 755`만 하는데 메모리가 크면 빨리진다 (?) |

Lambda가 처음 실행되면 다음의 과정을 겪는다.

1. `microvm`을 할당하고,
2. [`Code`](https://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html#SSS-CreateFunction-request-Code)에 명시된 s3의 `zip` 파일을 가져와서 `/var/task`에 압축을 푼다.
3. NodeJS 런타임이므로 `node handler.js`가 실행된다.
4. [`Handler`](https://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html#SSS-CreateFunction-request-Handler)로 지정된 함수가 실행되면서 `tgz`를 다운로드 받거나 압축을 풀거나, 파일을 복사하고 권한을 부여하는 작업들이 수행된다.

위 표에서 _준비 시간_ 은 4번 항목에 대한 부분을 측정한 것이고 _총 시간_ 은 해당 Lambda가 API Gateway event로부터 시작되어 결과가 반환될 때까지 소요된 총 시간을 측정한 것이다. 이 시간을 정밀하게 측정하는 것이 본 글의 목표가 아니므로 대략적으로 우위를 비교할 수 있는 수준으로만 측정하였고, 상술한 것처럼 4)의 방법이 제일 빨랐다. 대충 분석해보면 실험 `나`의 경우 _총 시간_ 이 _9초_ 인데 _준비 시간_ 이 _7초_ 라는 것은 2) 과정에서 `/var/task`로 압축을 푸는데 2초, 4) 과정에서 `tgz`를 `/tmp`로 푸는데 7초가 걸린다고 생각하면 된다. 물론 이는 추후 `AWS X-Ray`를 사용해서 좀 더 정확하게 확인해볼 수 있다.

아무튼 재밌는 점을 정리해보면,

- 똑같은 압축을 푼다고 해도 2) 과정에 의해 `/var/task`에 푸는 것이 4) 과정에 의해 `/tmp`로 푸는 것보다 더 빠르다. (실험 `나`, `다`)
- `/var/task`나 `/tmp`에 써야할 파일의 수를 최대한 줄이면 기동 시간이 더 빨라진다. (실험 `다`, `라`)
- 실제 consumption memory size는 1G를 넘지 않지만, 그냥 메모리를 더 크게 주면 기동 시간이 더 빨라진다. (실험 `라`, `마`)
- Lambda에 업로드되는 코드는 Zip 형식으로 대부분의 툴들이 Symlink 옵션을 빼놓았다. 때문에 Zip으로 올려야 하는 실험에서 어떻게 해야 고민하고 있었는데, 귀찮아서 so에 대한 모든 symlink 파일들을 제거하고, `usr`은 `include`만 한 벌 더 복제해서 올렸는데도 정상 동작하는 것을 확인했고 이렇게 구성된 파일을 실험에 사용했다.
- 다른 작업에서 확인한 내용이지만, 실험 a)에서 `musl.cc` 대신 S3에 올려둔 파일을 받는다고 해도 별다른 성능을 기대할 수 없다. S3와 Lambda의 통신도 생각보다 느리기 때문이다.

각 실험에서 사용한 모든 코드를 예쁘게 정리해두지는 않았지만 [이곳에서 전체 코드를 확인할 수 있다.](https://github.com/lacti/serverless-single-cpp-compiler) 나름 유의미했던 b), d) 두 개의 실험만 좀 자세히 보자.

#### 압축 풀어 사용하는 방법 (b)

먼저 압축 파일을 Serverless framework의 deploy 과정에서 같이 포함할 수 있도록 설정해준다. Python이나 Webpack을 사용하지 않는 NodeJS의 경우 `serverless.yml`의 `package.include`를 사용하면 되겠지만 Webpack을 사용하는 경우 다음과 같이 `CopyWebpackPlugin`을 사용하도록 `webpack.config.js` 파일을 수정한다.

```javascript
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  // ...
  plugins: [new CopyWebpackPlugin(["x86_64-linux-musl-native.tgz"])]
  // ...
};
```

그리고 handler가 시작될 때 다음과 같이 `/tmp` 밑에 적당한 디렉토리를 하나 만들고 압축을 풀어둔다. 만약 Lambda instance 재사용 등에 의해 이미 `/tmp` 내의 그 디렉토리가 존재한다면 굳이 다시 압축을 풀지는 않는다.

```typescript
const tmpDir = os.tmpdir();
const ccVersion = "x86_64-linux-musl-native";
const ccPath = path.join(tmpDir, ccVersion);
if (!fs.existsSync(ccPath)) {
  await new Promise<void>((resolve, reject) =>
    decompress(
      {
        src: `${ccVersion}.tgz`,
        dest: tmpDir
      },
      error => (error ? reject(error) : resolve())
    )
  );
}
```

그리고 `event.body`로부터 소스 코드를 받아서 이 `musl-gcc`로 빌드하도록 코드를 작성해준다.

```typescript
const extern = (file: string, args: readonly string[]) =>
  new Promise<{
    stdout: string | Buffer;
    stderr: string | Buffer;
  }>((resolve, reject) =>
    execFile(file, args, { encoding: "utf-8" }, (error, stdout, stderr) =>
      error
        ? reject(error)
        : resolve({
            stdout,
            stderr
          })
    )
  );

const compile = (sourceFile: string, executeFile: string) =>
  extern(path.join(ccPath, `bin`, `g++`), [
    "-static",
    "-O3",
    sourceFile,
    "-o",
    executeFile
  ]);
```

물론 `sourceFile`과 `executeFile`은 모두 writable storage인 `/tmp` 밑에서 생성될 것이다. 실행해서 결과를 가져오는 부분은 `extern` 함수를 `executeFile`에 대해 사용하면 될 것이다.

어쨌든 조심해야 할 것은, 이렇게 임시로 만들어 놓은 파일들은 Lambda instance 재사용에 의해 다음 요청 때에도 여전히 남아있을 수 있고, 이로 인해 가용 용량이 점차 소진될 수 있으므로 반드시 이런 임시 파일은 꼭 깨끗하게 정리를 해주어야 한다는 것이다. 물론 Lambda instance가 timeout 등 uncaught error에 의해 중단될 수도 있으므로 이는 단순히 `try-finally`에 의해 지우는 것이 아니라 아예 위치를 지정해놓고 작업을 수행하기 전에도 쓰레기가 있는지 검사해서 치우고 진행할 수 있도록 해야 의도치 않은 문제 없이 시스템을 잘 사용할 수 있을 것이다.

#### Lambda와 같이 배포해서 복사 (d)

어쨌든 위 방법은 `tgz` 라는 압축을 풀어야 하고, 이는 Lambda의 CPU와 Memory의 영향을 받기 때문에 준비를 위해 소모하기에는 좋은 방법이 아니다. 게다가 warmUp 역시 concurrent request가 1 이상을 고려해야 하는 경우에는 사용하기 애매한 방법이므로 가급적이면 조금 번거롭더라도 초기 실행 시간을 최대한 줄이는 편이 좋다.

때문에 압축을 푸는 과정을 생략하기 위한 방법을 알아보자.

먼저 `x86_64-linux-musl-native.tgz` 압축을 적당한 위치에 풀어둔다. 예제에서는 `cc`라는 디렉토리를 사용했다. 그리고 위에서 잠깐 언급한 것과 같이 Serverless framework은 Lambda에 올리는 codezip을 만들 때 symlink를 허용하지 않으므로,

- `usr` 디렉토리를 제외한 모든 symlink를 제거하고,
- `usr` 디텍로티를 만들고 `include` 디렉토리를 그 안에 넣고
- `usr/include/c++` 디렉토리만 `include/c++`로 남겨두었다.

이 과정은 [.postinstall.sh](https://github.com/lacti/serverless-single-cpp-compiler/blob/master/.postinstall.sh) 에 자세히 나와있다. `include` 디렉토리를 저렇게 만드는 이유는 조금이라도 파일 수를 줄이기 위함인데 이는 잠시 후 다시 자세히 이야기하겠다.

이제 준비된 `cc` 디렉토리를 배포에 포함할 수 있도록 `webpack.config.js` 파일을 수정한다.

```javascript
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  // ...
  plugins: [new CopyWebpackPlugin([{ from: "cc", to: "cc" }])]
  // ...
};
```

이제 handler가 시작될 때 이 파일을 `/tmp/cc`에 복사해주자. 그리고 필요한 파일들에게 실행 권한을 주어야 하는데 이 목록은 간단히 `cc` 디렉토리에서 `find . -type f -executable` 등으로 쉽게 가져올 수 있다.

```typescript
const ccPath = path.join(tmpDir, "cc");
if (!fs.existsSync(ccPath)) {
  fs.copySync("cc", ccPath);

  for (const exe of exes) {
    try {
      fs.chmodSync(path.join(ccPath, exe), "755");
    } catch (error) {
      console.log(`Cannot give a permission`, error);
    }
  }
}
```

이제 `musl-gcc`가 준비되었으므로 아까 봤던 코드와 동일한 방법으로 `event.body`로 전달된 코드를 컴파일하고 실행해볼 수 있겠다.

압축 해제에 비해 computing power를 사용할 일이 줄었기 때문에 생각보다 시작 시간이 꽤 단출되었다. 하지만 꽤 많은 수의 파일을 써야 한다는 점은 여전하기 때문에 만약 실행 시간을 더 줄이려면 정말 필요한 파일만 추려서 올리는 것이 더 좋다.

하지만 `musl-gcc`의 파일 구조를 잘 모르기 때문에, 그리고 워낙 파일이 많기 때문에 이걸 한땀한땀 추리는 것은 꽤나 어려운, 혹은 불가능한 일일 것이다. 때문에 조금의 위험 부담을 감수하면서 좀 더 편리한 방법을 사용해보자.

이 때 사용할 수 있는 것이 바로 `inotifywait` 툴이다. Ubuntu의 경우 `inotify-tools` package를 통해 설치할 수 있다. 이 툴은 파일 시스템의 이벤트를 감지하는 것으로 이걸 켜놓고 gcc를 수행하면 내게 필요한 파일만 딱 확인할 수 있다.

```bash
$ inotifywait \
  -m \                   # Watch multiple events
  -e access \            # Listen access event only
  -o dependencies.log \  # Write this result to "dependencies.log"
  --format "%w%f" \      # Watch files only
  -r \                   # Watch recursively
  "cc" &                 # Watch "cc" directory
$ ./cc/bin/g++ hello.cpp -o hello
$ kill %1
$ sort -u depenencies.log | less
```

이렇게 딱 필요한 파일만 잘 추리면 원래 `musl-gcc` 파일들에 비해 반 이상 줄일 수 있으므로 초기 기동 시간을 확실히 줄일 수 있다. 물론 대부분의 파일들은 header고 그에 비해 executable은 많지 않기 때문에 약간의 관대함을 보여 executable은 모두 올리는 것도 방법이겠다. 물론 어떤 header가 언제 불릴지 모르는 점도 조금은 불안하지만, _대회 채점 서버를 만든다_ 는 도메인으로 다시 돌아와본다면 사용할만한 header를 모두 포함하는 간단한 cpp 파일을 하나 작성해서 빌드하는 동안 얻어낸 결과만 추리는 것도 좋은 방법이라고 생각한다.

물론 이렇게까지 구성한 후에도 혹시나 싶어 단순 파일 복사 밖에 없는 이 실험에서도 Lambda의 `memorySize`를 늘려봤다. `1G`에서 `2G`로 늘렸고, 두 경우 모두 `memoryConsumption`이 `200MB` 수준인데도 `2G`인 경우에 초기 기동 시간이 단축되는 것을 확인했다(...) Undocumented의 영역이지만 참으로 알 수 없는 내용이 많다.

### 정리

`musl-gcc`를 AWS Lambda에서 사용하는 에제를 통해 AWS Lambda에서 외부 런타임을 실행하기 위한 방법에 대해 알아보았다. 정리해보면,

- 용량 등의 제약조건이 있으므로 사전에 잘 확인하고 간단한 것부터 잘 테스트해야 하며
- 최대한 static build로 구성된 외부 런타임을 사용하고 `amazonlinux`로 로컬에서 테스트도 충분히 수행해야 한다.
- 그리고 초기 기동 시간이 너무 느려 곤란할 경우 필요한 파일만 잘 추려서 올릴 수 있도록 하고, 가급적이면 모든 것을 `/tmp`에 다 올려서 사용하는 것보다 `/var/task`도 적절히 사용해주는 것이 효율을 더 좋게 할 수 있겠다.
- 마지막으로 이유는 모르겠지만 `memorySize`에 의해 초기 기동 시간이 달라지는 경우가 있으므로 이 값도 적절히 바꿔가며 실험해보자.
