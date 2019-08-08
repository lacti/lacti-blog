---
title: AWS Lambda를 사용해 단일 cpp 파일 컴파일하기
tags: ["aws", "serverless", "lambda"]
---

최근에 [백준 온라인의 저지의 10년 개발 이야기](https://startlink.blog/category/스타트링크/baekjoon-online-judge/boj-10-years/)를 읽다보니 대학 때 동아리 내 채점 서버를 만든다고, 당시 그나마 잘 쓴다고 생각했던 C#으로 간단한 채점 서버를 만든 적이 있다. _컴파일과 실행/채점이 충분히 빨리 끝난다는 가정 하에_ 무려 request queue도 없이 HTTP payload로 전달된 cpp 코드를 _즉시 컴파일+실행+채점한 후 결과를 반환하는_ 엄청난 구조였고, 각 단계에서의 비동기를 Task로 추상화해서 적절하게 TPL로 asynchronous를 관리했다고 하더라도 당연히 저 _컴실채_ 단계가 폭발하면서 숱한 서버 장애 속에 손 채점을 했던 엄청난 흑역사가 만들어졌다.

생각보다 사람들은 정상적인 코드를 제출하지 않았고, 컴파일이 동시에 실행될 수록 서버의 자원은 빠르게 고갈되었으며, 결국 요청 수가 크지 않았음에도 서비스가 빠르게 거부되었던 것이다. throttling와 queuing에 대해 조금이라도 고민했으면 이런 흑역사는 없었겠지만 당시의 무지함과 자만으로 흑역사의 아름다운 한 페이지를 장식한게 아닐까 싶다.

그런 정상적이고 당연한 구조, _`worker-pool`에 의한 채점 request 소진_ 은 잠시 접어두고 AWS Lambda를 통해 이 문제를 해결해보자. 즉, AWS Lambda에서 요청받은 cpp 코드를 컴파일하고, 실행해서, 그 결과를 반환하는 간단한 Serverless API를 작성해보자. 너무 의미없는 작업인지라 흥미가 떨어질 것을 막기 위해 두괄식으로 말하면 적어도 다음에 대한 내용을 배울 수 있다.

- 외부 runtime을 Lambda에서 실행하려면 어떤 것을 고민해야 할까
- AWS Lambda의 storage 크기는 얼마인가
- 초기 실행 시간을 어떻게 하면 줄일 수 있을까

사실 나만 재미있을 수도 있다 (...)

### 외부 runtime 실행하기

Lambda는 [firecracker-microvm](https://github.com/firecracker-microvm/firecracker)으로 관리되는 vm으로 [각 runtime에 따라 Java, Python, go, NodeJS 등의 language runtime이 포함](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)되어 있다. 이는 [amazonlinux](https://hub.docker.com/_/amazonlinux) 기반으로 만들어진 것으로 만약 local에서 테스트할 필요가 있다면 [lambc/lambda](https://github.com/lambci/docker-lambda)로 적절한 runtime을 골라서 docker로 테스트해볼 수도 있다. ~~물론 요새는 [custom runtime](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-walkthrough.html)이 나왔지만 그건 나중에 이야기해보자.~~

이렇게 특정 runtime을 선택해서 Lambda를 작성해도 뭔가 부족할 때가 있다. 예를 들면 [은전한닢](http://eunjeon.blogspot.com/)을 사용해서 간단한 tokenizing을 수행한다거나 아니면 이 글처럼 cpp를 빌드하기 위해 gcc를 실행한다거나 할 때다. 만약 실행할 외부 runtime이 간단한 구조라면, 예를 들어 golang으로 작성된 것이라면, 적절하게 외부 의존성 없이 static build를 해서 깔끔하게 그 binary를 같이 Lambda code와 배포해서 NodeJS의 경우 `child_process`를 사용해서 실행하면 되는데, 수많은 데이터 파일과 심지어 `.so` 파일에 의존하고 있는 경우에는 이 의존성을 적절히 해결해서 올려주어야 한다.

정리해보면,

- 가급적이면 static build를 해서 의존성이 없도록 만들고: 주로 [ffmpeg on AWS Lambda](https://intoli.com/blog/transcoding-on-aws-lambda/)로 많이 찾아볼 수 있다. 물론 ffmpeg의 경우 static build를 제공하기 때문에 몇몇 libav를 제외하면 간단하게 Lambda에서 사용할 수 있다. NodeJS의 경우 [ffbinaries](https://www.npmjs.com/package/ffbinaries)를 쓰면 아주 간단하다.
- 만약 필요하면 의존 파일들을 모두 적절한 위치에 구성해서 잘 실행될 수 있도록 묶어주고: 이 때 사용하면 아주 좋은 도구로 [exodus](https://github.com/intoli/exodus)가 있다. [musl-gcc](https://www.musl-libc.org/)라도 쓰지 않는한 아무리 static build를 해도 몇몇 `.so`는 의존성이 남는 경우가 있는데 이 도구를 사용하면 그런 의존 파일들을 모두 잘 추려서 **symlink** 로 적절히 실행될 수 있는 구조를 만들어준다.
- 데이터 파일들도 상대 경로로 잘 찾아질 수 있도록 구성해야 한다: 만약 배포하려는 프로그램이 무조건 절대 경로를 사용한다면 문제가 크다. Lambda에서 writable한 storage는 오로지 `/tmp` 뿐이기 때문이다.

이렇게 만들어진 외부 runtime 파일이 AWS Lambda 환경에서도 정상적으로 실행 가능한지 확인해보려면 [amazonlinux](https://hub.docker.com/_/amazonlinux)을 사용하면 된다. 예를 들어 `musl-gcc`를 확인해보고 싶다면 미리 `x86_64-linux-musl-native.tgz`를 받아 압축을 풀고 다음과 같이 확인해 볼 수 있다.

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

만약 무언가 에러가 발생한다면 경로가 잘못되었거나 필요한 파일이 누락되었거나 아니면 있는데 찾을 수 없게 환경 변수가 누락되었거나 혹은 target platform이 적절하지 않은 파일을 가져왔을 때이다. native 개발하던 경험을 살려서 열심히 해결해야 한다.

### AWS Lambda에서 외부 runtime을 실행하기

외부 runtime이 `amazonlinux` docker에서 잘 실행이 된다면 반은 성공한 것이다. AWS Lambda에서도 그게 올바르게 실행되기 위해서는 적어도 3가지를 조심해야 하는데,

- AWS Lambda의 용량 제한은 얼마인가
- 이 외부 runtime을 실행하기 위한 플랫폼이 일치하는가
- container의 제약 조건이 충분히 너그러워서 외부 runtime을 실행할 수 있는가

먼저 AWS Lambda의 storage는 코드가 배포되는 readonly storage인 `/var/task` 와 임시 파일을 read/write할 수 있는 `/tmp`가 있다.


#### AWS Lambda의 code storage

`/var/task` 에 파일을 배포하려면 처음 `lambda function` 을 등록할 때 s3로 제출하는 압축 파일에 배포할 파일을 다 넣어놔야 하고, 이 때 `/var/task` 에서 허용해주는 최대 용량은 약 **250MB** 이다. 이 때 압축은 zip으로 하기 때문에 별다른 옵션을 주지 않는다면 symbol link가 유지되지 않을 수 있고 info-zip 규격이 아닐 경우 permission이 모두 소실되므로 위와 같이 정리된 외부 runtime을 실행하기가 어렵거나 불가능하다.

심지어 symlink를 사용하지 않고 어떻게 잘 배포했다고 해도 실행 파일의 모든 executable permission이 사라지게 되고, 여기에 chmod 등으로 실행 권한을 부여하려고 해도 readonly storage이므로 불가능하다.

AWS Lambda Layer를 사용하여 미리 구성된 혹은 provided runtime을 구성할 수 있지만 이것들도 모두 합쳐 250MB의 공간을 같이 사용하는 것이기 때문에 각별히 주의해야 한다.

하지만 이러한 단점에도 불구하고 이후 설명한 tmp storage (512MB) 와 합쳐 AWS Lambda가 최대한 사용할 수 있는 storage 공간의 총 크기가 750MB 수준인 점으로 볼 때 이 용량은 너무나도 소중하다. 만약 tensorflow 같은 다소 무거운 라이브러리를 AWS Lambda에 배포할 계획이 있다면 이 점은 꼭 명심해야 한다.

또한 정확한 내용은 알 수 없지만 두 storage의 write speed가 달라서 가급적이면 

#### AWS Lambda의 tmp storage