---
title: 함수 값 반환 방법[어셈블리]
tags: ["c"]
---

함수에서의 값 반환이 실제로 기계어 수준에서는 어떻게 이루어지는지 알아보자.

## 참고

assembly 정도는 알고 있어야 무얼 이야기하고자 하는지 알 수 있다.
아래의 코드들은 `gcc((Debian 4.3.4-5) 4.3.4)` + `gdb(6.8.50.20090628-cvs-debian)`인 curs-server에서 실험한 것이다.
vs환경에서 해보면 좀 다를 것 같다.

## 본문

함수는 1-2 공전계 시간에 배우고, 함수 호출 원리는 2-1 컴퓨터시스템 시간에 PC 조작과 스택에 return address를 어떻게 넣고 불러오느냐로 배우고, 그걸 직접 짜보는 것은 3-1 CA 시간에 해보았지만,

의외로 함수 값 반환 방법은 자세히 배워본 적이 없다.

보통 우리가 알고 있는 함수 값 반환 방식은 `eax`에다 반환할 값을 넣고 함수 코드를 `ret`하면 호출지점 코드에서 `eax`에 있는 값을 가져오는 것이다.  
하지만 `eax`는 IA32 register로 그 크기가 32bit, 즉 4byte인데 **이 크기를 넘어가는 걸 반환하는건 어떻게 할 것인가**가 이 글에서 확인해보려는 점이다.  
(실제로 이건 내가 무슨 세미나인가를 할 때 참관한 선배님께서 질문해주신 건데, 모른다고 하셨으나 분명히 알고 계셨을것이라, 당시에는 대충 포인터로 넘겨서 어디선가 복사하겠죠, 라고 대답했는데 갑자기 생각나서 해당 코드를 만들어 disassemble)

```c
#include <stdio.h>
#include <string.h>

struct Me
{
    char name[12];
    int age;
};

struct Me me (void)
{
    struct Me m;
    strncpy (m.name, "lacti", 12);
    m.age = 23;
    return m;
}

int main (void)
{
    struct Me m = me ();
    printf ("name = %s, age = %d\n", m.name, m.age);
    return 0;
}
```

이런 코드가 있다.
여기서 main의 첫째줄 코드와 me() 함수의 값 반환 코드를 보면 될것이다.

gdb를 써줘서 disassemble 코드를 보자. [gdb, disassemble main]

```c
0x08048420 <me+44>:     mov    -0x14(%ebp),%eax
0x08048423 <me+47>:     mov    %eax,(%ebx)
0x08048425 <me+49>:     mov    -0x10(%ebp),%eax
0x08048428 <me+52>:     mov    %eax,0x4(%ebx)
0x0804842b <me+55>:     mov    -0xc(%ebp),%eax
0x0804842e <me+58>:     mov    %eax,0x8(%ebx)
0x08048431 <me+61>:     mov    -0x8(%ebp),%eax
0x08048434 <me+64>:     mov    %eax,0xc(%ebx)
```

반환 부분 코드다.

`-0x14(%ebp)`부터 지역변수 `struct Me m`의 시작인데, 이게 `-0x08(%ebp)`까지해서 총 4byte(왜냐하면 struct Me는 char[12] + int이니까)를 차례대로 `%ebx`의 0x00부터 0x0c까지 집어넣는것이다.
즉 memcpy.

그리고

```c
0x08048437 <me+67>:     mov    %ebx,%eax
```

그 `ebx` 값, 즉 메모리 주소인데 어떤 메모리 주소냐하면 지역변수 `m`에 담긴 정보가 **복사**된 곳의 메모리 주소가 `eax`에 담겨서 반환된다는 것이다.  
여기까지 한줄로 요약하면 **지역변수가 반환될 때 메모리에 복사되어 그 주소값이 eax로 넘어간다**가 되는 것이다.

지역변수가 왜 지역변수냐? 하면 함수 호출이 끝나고 다 없어지기 때문이다. 어떻게 없어지나 하면

```c
0x080483f5 <me+1>:      mov    %esp,%ebp
0x080483f8 <me+4>:      sub    $0x24,%esp
```

처음에 쓸 만큼 stack pointer를 계산해두고, `ebp`에 stack 시작점을 담아서, `ebp`부터 `esp`까지의 영역을 지역변수를 사용하는 공간으로 쓰다가,

```c
0x08048439 <me+69>:     add    $0x24,%esp
```

함수가 끝날 때 stack pointer를 다시 복원하면서, 아까 사용하는 공간을 폐기하는 것이다. 그래서 함수가 반환될 때 공간이 폐기되므로 반환 시 그 값을 **복사** 한 것이다.

그렇다면 `ebx`는 어디를 가리키고 있단 말인가?

```c
0x080483fb <me+7>:      mov    0x8(%ebp),%ebx
```

이 코드를 보면 `ebx`는 `ebp`의 `+0x08` 지점을 가리키고 있는데, 또 그럼 여기가 어디냐라는 문제가 있다만 간단히 생각해보면
지역변수를 사용할 때는 보통 ebp에 -값을 더해서 썼다. 즉 `-0x14(%ebp)` 등과 같이 썼다는 것이다.  
즉, `esp = ebp - 0x24`였으므로 `ebp`부터 `ebp - 0x24`까지가 지역변수 영역이라 지역변수는 다 `ebp` 기준으로 - 영역에 있는 것이다. 근데 저건 + 이니까 지역변수가 아니란 말씀.

그럼 어디냐? *`me()` 함수를 호출한 main의 영역*이다.

여기서 이제

```c
0x08048452 <main+17>:   lea    -0x14(%ebp),%eax
```

이 코드를 통해
`me()` 함수 내에서의 `%ebx` 값이 `main()` 함수에서 설정한 `-0x14(%ebp)`의 주소로 결국 main() 함수의 지역변수 영역이라는 것만 설명하면 될텐데 집에서 점심먹으러 나간다고 빨리 준비하란다

그래서 일단 정지
