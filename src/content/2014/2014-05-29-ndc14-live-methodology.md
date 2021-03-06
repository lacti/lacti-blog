---
title: 신입 프로그래머들의 고민을 통해 생각해보는 누구나 쉽게 적응할 수 있는 프로젝트 만들기
tags: ["ndc14", "live"]
---

- [최진욱](https://twitter.com/LTeaRain)
- [장승호](https://twitter.com/skyser2003)

## 요약

- Effective (Live) Old Project
- 적절한 과제를 통해 신입 프로그래머의 실력 향상을 돕자.
- 추후 라이브 상황을 고려하여 신규 때 기반을 잘 닦도록 하자.

## 목표

- 오래 라이브 서비스가 가능하면서 신입이 쉽게 적응할 수 있는 project를 만듭시다.

## 신입은 무슨 생각

- 라이브에 배치됨
  - 이미 만들어진 게임, 할게 적을 것 같다.
  - 하지만 이벤트 등의 신규 컨텐츠 구현할 게 꽤 많다.
- 실력에 대한 불안감
  - 채용 후 근거없는 자신감으로 변함
  - 실력 향상을 위한 도서 등의 가이드가 필요하다.
- **지침과 격려가 필요함**

## 사례 연구

- CSO2
  - 자력으로 문제 해결 능력을 키우도록 과제를 준다.
- M1
  - 코드 분석을 통해 의도/흐름을 정리하도록 한다.
  - 기존 시나리오를 바탕으로 유사 코드를 작성하도록 한다. (2달 정도)
  - 결과에 대한 평가/피드백으로 같은 실수 방지 등의 실력 향상 도모
  - 실무와 유사한 작업이므로 실력과 자신감을 같이 키울 수 있다.
  - 모두에게 발표: 기존 프로그매러도 큰 그림을 볼 기회를 얻음
- GE
  - 신입이 할만한 것으로 과제를 부여
  - 있으면 좋은 기능 중 복잡도가 낮고 부담이 별로 없는 것을 준다.
  - 몇 번 반복시킨다.
- **적절한 난이도 과제를 주어서 불안을 몰입으로 만들 기회를 주자**

## old project에서 겪는 문제 및 해결

- legacy
  - 문서화했다고 해도 찾는데 부담이 크다.
  - 그냥 코드를 잘 작성해서 코드만으로 유추할 수 있도록 하자. _(literate programming?)_
- TODO
  - 오래되면 엄청 많아지니 convention을 통해 category하는 등 잘 찾아볼 수 있도록 한다.
- 툴 소스 관리
  - 툴의 binary만 버전관리하지 말고 툴 source도 같이 버전 관리를 해서 추후 유지보수가 가능하도록 한다.
- 폐기된 코드
  - 코드 파악에 방해되므로 주기적으로 정리한다.
    - 주석처리 하지 말고 삭제하거나 브랜치로 관리한다.
  - 많아질 경우, c++ 같은 언어라면 컴파일 시간도 길어질 수 있다.
- 컴파일 시간 증가
  - 급하면 컴파일 시간을 줄이겠다고, 하단 수정이 필요함에도 상대적으로 의존성이 적은 상단에서 수정을 할 수도 있다.
  - include 정리, forward decl, pch, include 정리, unitybuild 도입, 빌드 머신 scale up, incredibuild 도입 등을 고민해본다.
- 과도한 절약과 최적화로 인한 유지보수 어려움
  - macro, template
    - 신입들은 익숙하지 않다.
    - visual assist x나 intellisense의 성능을 저하시킨다.
    - 왠만하면 자제 부탁
  - 주요 변수를 8bit로 구현
    - 시간이 지나면 256개로는 부족하다.
    - 쉽게 고칠 수 있는 부분이 아니라면 초기부터 넉넉하게 할당해두자.
  - profiling을 통한 필요 부분 최적화를 지향하자.
  - 차후 수정이 쉬운 방향으로 리팩토링을 하자.
- pImpl
  - build-time이 줄어드는 것이 좋기는 하지만,
  - interface와 implement 모두 수정해야 하므로 코드 수정량이 많아진다.
  - debugging할 때도 step 수가 많아져서 불편하다.
  - 과도한 사용을 하지 말자.
- 정보 공유
  - 정보 공유를 위해 Q&amp;A를 자주하면 작업 효율성이 저하된다.
  - 정보 저장소를 관리해서 검색할 수 있게 하자.
- UnitTest 부재
  - 코드 수정을 쉽게 할 수가 없다.
  - 특히 Client/Server 구조에서 둘 다 구동해서 login하고 테스트하는 것은 비용도 크다.
- external library 사용은 신중히 하자.
  - license 정책이 변경되는 경우가 있다.
  - 해당 기능이 표준으로 통합될 수 있다.
- Tool에 VCS api를 hard-binding하지 말자.
  - specific한 VCS api를 hard-binding하면 추후 VCS 변경이 어렵다.
  - 중간에 추상화된 layer를 두고 연결할 수 있도록 하면 좋겠다.
- 구현을 비워둔 virtual function이 있다면 assert라도 넣어주자.

## ~~그래도~~ 좋은 점도 있다

- M1
  - XML 기반의 UI
    - unpack 등 보안에 취약한 점도 있지만 생산성 증대 효과가 더 크다.
  - MetaData
    - string key/value 형태로 가독성 덜 해치는 범위에서 급한 코딩을 할 때 유용하다.
  - 직군 회의
    - merge나 localize 이슈 등의 불편 사항을 공유/논의할 수 있어 좋다.
  - 운영툴
    - 잘 만들어놨다.
  - script 함수 목록 gathering이 가능하다.
- GE
  - 기획자 처리 범위가 넓어 대부분의 컨텐츠를 기획자가 구현하는 것이 가능하다.
    - XML 구조가 간단해서 가능하다 (?)
  - 범용적 script (...)
  - 짧은 빌드 시간
  - 단일 솔루션으로 인한 빌드 관리가 용이하다.
- 공통
  - 전 국가 trunk를 공유하고 기능별로 로직을 분기한다.
  - merge 비용이 적고 side effect를 조기에 발견 가능하다.
  - 근데 build broken 상태가 되면 stop the world.
    - 신속한 수정이 가능하다면 괜찮다고 본다.

## 결국 &amp; 그러므로

- 기간이 좀 지나면 시니어 프로그래머는 신규 프로젝트로 떠난다.
- 안전성 문제로 리팩토링 &amp; 신규 기술 도입을 쉽게 할 수 없다.
- 얻을 수 있는 부분을 얻자.
  - 라이브를 해봐서 얻는 부분이 있다.
  - 프로그래머라면, 제한된 여건에서 설득을 하는 기술 등
- **나는 계속 배우고 있구나** 라는 관점을 견지하자.

## 정리

- 처음부터 많이 고민해서 좋은 라이브가 될 수 있도록 노력이 필요하다.
  - 그리고 믿고 의지할 시니어가 있으면 좋겠다.

## Q&amp;A

- 신규 프로젝튼 어떤가요?
  - 열정적이다.
- 라이브가 뭔가요?
  - 서비스를 시작하면 라이브임
- 프로그래머와 소통을 하려면 어떻게 하는 것이 좋을까요?
  - 프로그래밍 언어의 기초를 익혀두면 프로그래머에 대한 이해를 하기 좋다.

---

- 내용이 상당히 유익하고 많다. Effective 시리즈를 연상시킬만큼 case by case에 대한 이야기가 많다.
- 그런데 발표 시간이 25분으로 너무 짧았고, 그 발표 시간에 맞추기 위해 내용을 축약한 점이 아쉽다.
- 많은 사람들이 볼 수 있도록 위키나 블로그에 위 내용을 정리 &amp; 발전시키면 좋겠다.
- 발표자 컨디션이 좀 안 좋았는지 (양이 많아서 말이 빠른 것과 별개로) 목소리에 좀 힘이 없는 것 같았다.
