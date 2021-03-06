---
title: 모바일 데이터 분석
tags: ["ndc14", "data"]
---

[https://www.slideshare.net/5rocks_io/ndc-20140529](https://www.slideshare.net/5rocks_io/ndc-20140529)

- [서하연](https://www.5rocks.io/)

## 요약

- 시계열 분석 대신 시간대별 분석을 사용한다.
- 유저의 특성에 따라 분석 결과를 개별적으로 적용한다.

## 모바일 특성 이해하기

- 모바일 특성을 이해해야 어떻게 분석할 지 알 수가 있다.
- 유저의 쏠림 현상
  - LifeStyle이 반영된다. mobile 기기의 특성 상 특정 시간대에 집중. eg) 출퇴근 시간
  - Marketing 효과가 크다. 특정 시간대 이벤트할 경우, Push 발송 등에 의해.
    - 최대치가 보통에 비해 2~4배 정도 차이가 남. 심하면 몇 십배까지도 차이가 난다.
- Simple Context
  - Context: 목적을 달성하기 위해 이뤄지는 일련의 action
  - device의 특성 상 화면 크기가 제한적이고 operation이 제한적이어서 action 선택 가지 수가 제한적이다. (touch, swipe)
  - 평균 1분30초 ~ 5분의 session time내 play pattern이 결정되므로 만들어질 수 있는 context의 한계가 있음
- 빠른 feedback
  - 만족하지 않으면 빠르게 이탈한다. 길어야 2~3달. (성공한 mobile game들이 top을 유지한 시간의 평균)

## 모바일 환경의 이슈들 - 데이터 처리

- 데이터 처리
  - 수집 정리 (processing)
  - 분석, 지표화, 사업 반영/활용
- 로그 포맷 이슈
  - 많은 간단한 데이터가 단 시간에 쏟아지는 경우 정의는 어떻게 할 것이며, 처리는 어떻게 할 것인가?
- 로그 해상도 이슈
  - 어느 정도까지 자세히 남겨야 하나? 자세함과 logging 부담의 trade-off를 고려한다.
- 로그 유실 관련 이슈
  - 모바일의 특성 상 유실이 심할 수 있다. 어떻게 correction할 것인가?
- _(위 주제에 대한 자세한 내용에 대해서는 화요일 세션에 발표했으므로 해당 발표를 참조하도록 한다.)_

## 모바일 환경에서 데이터 분석

- 지표의 정합성 확보
  - 잘못된 지표로 운영하면 망한다.
  - 잘못된 데이터 기반일 경우도 있으니 주의해야 한다.
  - eg) retention 값을 잘못 지정하고 luanching을 했다가 open 이후 marketing을 안해서 망했다.
  - LifeCycle이 짧으니까 삽질 한 번 잘못하면 회복할 기회가 없다.
  - 측정값과 대상값을 구분해야 한다.
    - install 수, 신규 유저, active 유저, session 수, session time, 매출, paying 유저, 구매 회수
  - 이상 징후가 잘못 집계될 수 있으니 주의해야 한다.
  - open 전 테스트 기간부터 위 값을 수집/분석하여 의도대로 결과가 나오는지 확인을 해야 한다.
- interval 개념 전환
  - 일/주/월 단위 뿐만 아니라 **시간대별 분석**이 필요하다.
  - **actionable data**
  - 시계열 data는 현상을 볼 수는 있어도 왜 그런 현상이 일어나는지, 그래서 뭘 해야 하는지 알기가 어렵다.
  - eg) daily active user. 주말에 active user가 많다. _그래서?_
  - **보는 방식을 바꾸자**
  - eg) 위 데이터를 24시간으로 재배치해서 재구성. 그 중 평일/주말 방문 도수를 시간대 별로 보자.
    - 어떤 유저가 늘 접속하던 9시에 접속을 안했다.
    - 그 유저에게 뭔가를 해주어야 이탈하지 않을 가능성이 높다.
  - eg) Item 판매량을 시간대별로 재구성
- 분석 결과를 user별 적용
  - 휴면 유저와 구매 유저는 구분해서 적용해야 한다.
  - 전체 data를 분석해서 pattern을 찾아도, 적용은 개별적으로 해야 한다.
  - eg) 시계열 graph로 휴면 유저를 보면, 그냥 휴면 유저가 늘고 있다는 것만 알 수 있다. 즉, 현상의 결과만 볼 수 있다.
    - 매일 방문 유저가 4일째 접속을 안할 경우,
    - 주말에 주로 접속하는 유저가 4일째 접소을 안할 경우,
    - 두 유저를 같은 유저로 취급해서 방문 push를 보내면 안된다.
    - 따라서 사용자의 play pattern, 구매 pattern을 개별 분석 후 적용해야 한다.
- `user별 이탈자 수 = {휴면기간} / {User 고유 접속 주기}`
  - 고유 접속 주기는 매일 접속일 경우 1, 주말 접속일 경우 7이 된다.
  - 4일 접속 안한 평일/주말 플레이 유저의 이탈지수는 각각 3, 0.57이 된다.
  - 이 graph를 만들어 특정 구간을 넘어선 유저에 대해 push를 보낸다.
  - 구매에 대해서도 같은 방식을 적용할 수 있을 것이다.

## 정리

- 정확한 지표를 확보하고
- 시간대별 지표 분석이 필요하다.
- 휴면/구매 유저 관리는 개별적으로 한다.

## Q&amp;A

- 유저의 접속률을 장기적으로 만드려면 어떻게 해야 하나?
  - 우리나라는 초반 유입 집중이 심한 편이니 초반 1주일을 제대로 관리하고,
  - 장기적으로는 `{이탈율} / {app 전체 총량}` 마케팅을 장기적으로 지속 관리한다.
    - eg) 특정한 날 install한 유저를 추적 관리함
- 유저별 시간대 행동 패터늘 어떻게 묶는 것이 좋을까?
  - 복잡한 통계 기법을 사용할 수도 있다.
  - 아니면 일단 가시적으로 보이는 group을 찾아보자.

---

- 데이터 처리 방법이 궁금했던 것인데 그건 첫째 날 발표한 것이어서 이번 내용에는 빠졌다.
- 사례에 대한 이야기도 많아서 짧은 시간에 폭풍같이 발표가 끝났다. 원래 아는 분야가 아니라 내용에 대해서는 할 말이 없다.
