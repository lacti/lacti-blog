---
title: iPad의 Working Copy
tags: ["writing"]
---

원래 말이 많은 편이라 가급적이면 그 에너지를 아껴서 글로 정리해두려고 하는 편인데 생각보다 게을러서 잘 하지는 않고 있다. 때문에 가끔은 직접 글을 쓰는 것보다는 작성한 글을 어떻게 게시할 것인지에 더 많은 관심을 가지기도 한다.

현재 [이 블로그](/)에 작성되는 글은,

- 예전에는 GitHub 내장 Jekyll을 사용하여 [GitHub Repository](https://github.com/lacti/lacti.github.io)에 게시하는 구조로 만들어져있었지만
- 최근에는 이 방법을 까먹기도 하고 [React](https://reactjs.org) 를 좀 써보기도 해서 듣기만 했던 [Gatsby.js](https://gatsbyjs.org) 를 사용하여 게시될 수 있도록 [Repository](https://github.com/lacti/lacti-blog) 를 추가하고 Travis-CI를 통해 [GitHub pages](https://github.com/lacti/lacti-blog) 로 게시되도록 바꾸었다.

다행히 Markdown으로 작성된 내용은 큰 변경없이 가져올 수 있었고 TypeScript로 blog template을 구축해놓은 [gatsby-starter-typescript-plus](https://github.com/resir014/gatsby-starter-typescript-plus) 가 있어서 큰 변경없이 블로그를 이전할 수 있었다. 이에 대한 자세한 이야기는 다음에 정리하기로 하고, 본 글에서는 결국 그 이후에도 글을 쓰지는 않고 글을 쓰기 위한 도구에만 메달리다 깨달음을 얻은 이야기를 하려고 한다.

## 발단

WordPress 같은 CMS 도구를 사용하지 않으면서도 제대로 된 개발 환경을 갖추지 않고도 글을 쓰기 위해서는 이것저것 준비할게 많다. 이를 위해 직접 CMS를 만드는 것도 ~~물론 재미있는 일이지만~~ 그것을 운영하기 위해 **요금이 발생하기 때문에** 가급적이면 유지비가 최소화될 수 있는 방향을 고려했을 때에는 아무래도 빛이 바랜다.

때문에 GitHub Pages라는 훌륭한 방법을 선택했지만

- 좀 제대로 해보려면 Git clone을 받고 md 파일 등을 수정하기 위한 환경을 구축해야 하거나,
- 아니라면 GitHub에 모바일 기기 등으로 로그인해서 Edit file의 도움을 받는 수 밖에 없다.

후자의 경우 예전에 실험해봤을 때 한글 입력이 잘 안 되는 문제가 있어서 포기했고, 결국 전자의 방향을 고민하다 보니 아무래도 값싼 서버를 하나 띄워두고 그 서버에 작업 환경을 구축하는 수 밖에 없겠다는 폭주 기관차가 탄생하고 말았다.

## 전개

여러 가지 장난감을 돌리기 위한 용도로 띄워놓은 AWS Lightsail 서버가 있다. 매달 사용료가 $3.5인 아주 착한 서버고 가격에 걸맞는 성능을 보여준다. 하지만 Core가 있으니 된거고(?) Memory도 512MB나 있으니 별 문제가 없을 것이라고 생각해서 열심히 [nvm](https://github.com/nvm-sh/nvm) 설치해서 nodejs 환경 만들어두고 blog source를 clone해서 yarn으로 dependencies를 설치하는 순간..! yarn이 `killed` 되었다.

... 몇 차례 확인 끝에 이게 OOM으로 인해 발생한 문제임을 깨닫고 (1), Lightsail instance에는 Swap 설정도 없다는 것을 깨닫고 (2) Swap을 넉넉하게 `4G`(!) 로 설정해준 후에 모든 환경이 원활하게 설치되는 것을 확인하였다. 빠른 Swap 고갈과 함께!

이후 모바일 기기나 iPad에서 SSH로 그 서버에 접근해 vim으로 md를 수정하자는 야심찬 계획을 세우고 [Termius](https://termius.com) 까지 설치하고 SSH로 연결해 즐거움을 만끽하려는 찰나, code-server가 기억났다.

## 위기

[code-server](https://github.com/cdr/code-server) 는 [Visual Studio Code](https://code.visualstudio.com) 를 원격에서 Web Browser로 접근할 수 있게 해주는 훌륭한 물건이다. golang으로 만들어진 좋은 물건으로 prebuilt binary만 가져다가 쉽게 사용할 수 있다. 해당 서버에 설치해서 clone받은 곳에서 서버를 열었더니 정말 별 설정 없이 잘 접근이 되었다: `code-server -H -P password`

무려 Terminal까지 열 수 있어서 `gatsby develop` 까지 켜놓고 편집한 내용이 preview로 반영되는 것까지 확인하고 굉장히 기뻐한 찰나. ~~물론 제일 저렴한 VM이므로 Preview가 제대로 보이기까지 거의 30초에서 1분 정도 걸린다는 문제가 있다.~~

## 절정

*무언가 이상하다* 라는 생각이 들었다. 이 환경을 준비한건 분명 어디서나 글을 쉽게 쓰기 위함이었다. 그 때에는 노트북을 가지고 있지 않을 것이기 때문에 아마도 핸드폰이나 iPad를 사용해서 글을 작성하게 되는 상황일 것이다. 그리고 그런 상황에서 내가 글을 쓸만큼 오래 있는 상황은 아마 어딘가 먼 곳으로 이동 중인 교통 수단 안이거나 집 밖의 환경에서 장기간 체류하는 경우일 가능성이 높다. 

좀 더 구체적으로 이야기해보면, 8월 말에 해외에 갈 일이 있어 장거리 비행을 해야 하는데 그 때 비행기 안에서 글을 쓰고 싶다는 것이 이 여정의 시작이었던 것이다.

맨날 서버만 보고 살아서 모든 것을 서버에 올려두고 단말기로는 접근만 하고 싶었던 것인지 이번에도 문제는 완전히 잊고 서버부터 구축하고 있었던 것이다. 그나마 다행인건 _시운행 전에 문제를 깨닫고 방향을 전환했다는 것 정도?_

## 결말

그래서 iPad에서 Git clone을 받아 글을 작성하고 나중에 네트워크가 연결되면 push할 수 있는 환경이 있는지 찾아봤더니 [Working Copy](https://workingcopyapp.com) 라는 좋은 앱이 나왔다. 놀랍게도 `ipad git clone` 이라고만 구글에서 검색했는데! 생각 이상의 훌륭한 앱이 나왔고 한글도 잘 지원하고 Markdown editing도 나쁘지 않고 아무튼 마음에 든다.

게을러서 Travis-CI를 통해 Git push event가 발생하면 gatsby build해서 lacti.github.io에 올려놓도록 했으니 이제 틈틈히 글 써서 push만 해두면 손쉽게 글을 올릴 수 있겠다. 글을 틈틈히 쓰느냐는 또 다른 게으름의 문제겠지만..!