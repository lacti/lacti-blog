---
title: AWS Lambda의 storage 이야기
tags: ["aws", "lambda"]
---

[AWS Lambda](https://aws.amazon.com/lambda/)는 Cloud 자원 중 가장 비용 효율적으로 computing resource를 대여할 수 있는 서비스로 간헐적으로 수행되는, 혹은 짧은 시간 내에 많은 병렬 작업을 수행해야 하는 경우에 사용하기 아주 좋다. 하지만 AWS Lambda는 여러 제약 조건을 가지고 있는데, `core`, `memory`, `executionTime` 처럼 잘 알려진 조건 말고도 storage의 최대 크기가 **750MB** 라는 제약이 있고, 그나마도 읽기/쓰기 속도가 다소 느리다는 단점이 있다. 본 글에서는 이 stoage 문제에 집중해서, 어떻게 해야 storage를 효과적으로 사용할 수 있는지를 알아볼 것이다.
