---
title: AWS Lambda의 storage 이야기
tags: ["aws", "lambda"]
---

[AWS Lambda](https://aws.amazon.com/lambda/)는 Cloud 자원 중 가장 비용 효율적으로 computing resource를 대여할 수 있는 서비스로 간헐적으로 수행되는, 혹은 짧은 시간 내에 많은 병렬 작업을 수행해야 하는 경우에 사용하기 아주 좋다. 하지만 AWS Lambda는 여러 제약 조건을 가지고 있는데, `core`, `memory`, `executionTime` 처럼 잘 알려진 조건 말고도 storage의 최대 크기가 **750MB** 라는 제약이 있고, 그나마도 읽기/쓰기 속도가 다소 느리다는 단점이 있다. 본 글에서는 이 stoage 문제에 집중해서, 어떻게 해야 storage를 효과적으로 사용할 수 있는지를 알아볼 것이다.

먼저 AWS Lambda의 storage는 코드가 배포되는 readonly storage인 `/var/task` 와 임시 파일을 read/write할 수 있는 `/tmp`가 있다.

#### AWS Lambda의 code storage

`/var/task` 에 파일을 배포하려면 처음 `lambda function` 을 등록할 때 s3로 제출하는 압축 파일에 배포할 파일을 다 넣어놔야 하고, 이 때 `/var/task` 에서 허용해주는 최대 용량은 약 **250MB** 이다. 이 때 압축은 zip으로 하기 때문에 별다른 옵션을 주지 않는다면 symbol link가 유지되지 않을 수 있고 info-zip 규격이 아닐 경우 permission이 모두 소실되므로 위와 같이 정리된 외부 런타임을 실행하기가 어렵거나 불가능하다.

심지어 symlink를 사용하지 않고 어떻게 잘 배포했다고 해도 실행 파일의 모든 executable permission이 사라지게 되고, 여기에 chmod 등으로 실행 권한을 부여하려고 해도 readonly storage이므로 불가능하다.

AWS Lambda Layer를 사용하여 미리 구성된 혹은 provided 런타임을 구성할 수 있지만 이것들도 모두 합쳐 250MB의 공간을 같이 사용하는 것이기 때문에 각별히 주의해야 한다. 하지만 이러한 단점에도 불구하고 이후 설명한 tmp storage (512MB) 와 합쳐 AWS Lambda가 최대한 사용할 수 있는 storage 공간의 총 크기가 750MB 수준인 점으로 볼 때 이 용량은 너무나도 소중하다. 만약 tensorflow 같은 다소 무거운 라이브러리를 AWS Lambda에 배포할 계획이 있다면 이 점은 꼭 명심해야 한다. 또한 정확한 내용은 언급되어 있지 않아 알 수 없지만, 두 storage의 체감 쓰기 속도가 달라서 **가급적이면 code storage를 많이 사용하는 것이 좋다.**

#### AWS Lambda의 tmp storage

`/var/task`와 다르게 writable한 공간이고 무려 크기가 **512MB**이다. 하지만 [Lambda의 instance는 재활용될 수 있고](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda/) 이 과정에서 예전 수행 중 tmp에 썼던 파일이 이번에도 남아있을 수 있게 된다.

> Files that you wrote to /tmp last time around will still be there if the sandbox gets reused.

때문에 임시 파일을 작성할 때에는 늘 작업 이후 그 파일들을 제대로 지워주어야 하고, 만약 uncaught error나 timeout 등의 termination으로 인해 이런 정리가 실행되지 못할 수 있으므로 만약 tmp를 제대로 사용해야 할 일이 있다면 꼭 사용하기 전에도 그곳의 상태가 기대한 상황과 같은지 확인해야 한다. 즉, **사용하기 전에도 치우고 사용하고 나서도 치워야 한다는 마음가짐으로 로직을 작성해야 문제없이 사용할 수 있다.**

용량은 크지만 체감상 쓰기 속도도 code storage에 비해 느리기 때문에 정말 임시 데이터 파일을 위해 사용할게 아니라 비대한 코드의 추가 공간으로 사용할 계획이라면 반드시 code storage부터 다 소모하고 와야 한다. 이는 추후 tensorflow를 Lambda에서 수행하도록 추리는 과정으로 정리해보도록 하겠다.
