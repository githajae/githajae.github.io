---
title: "&#91;Vert.x&#93; Vert.x 란 무엇일까?"
layout: profession-post
categories:
  - Programming
tags:
  - VertX
  - BackEnd
toc: true
toc_sticky: true
type: profession
---

![Vertx 로고][1]

## Vert.x 와의 만남
SK 하이닉스 인턴을 갔을 때 처음 **Vert.x** 라는 걸 접해보았다.

이걸 가지고 개인 과제를 해야 하는데.. 처음으로 제대로 된 코딩이라는 걸 해보는 지라 개념을 이해하는 것도 쉽지 않았다.

그래도 꾸역꾸역 이해하고 보니, 오.. 상당히 흥미로운 친구였다.

이에 영감을 받아 현재 [클리어 어플리케이션 백엔드][2]가 Vert.x 로 구동중이기도 하다.

## Vert.x 란?

Vert.x는 **비동기 네트워크 서버 프레임워크** 다.

나온지는 몇 년 정도 됐지만, 아직도 꾸준히 업데이트 중이다.

심지어 네이버에서 개발에 일부 참여한 상당히 핫한 프레임워크다!

## 아니 그래서 비동기가 뭔데?

> 아니 나는 컴퓨터공학과 3년 다닐 동안 비동기라는 걸 들어본 적도 없는데 비동기가 뭔데?

Vert.x 를 찾아보면서 비동기라는 글씨를 너무 많이 마주해서 빡친 끝에 나온 말이었다.

이후에 따로 자세히 글을 올리겠지만, 간단하게 비동기는 요청 -> 결과가 동시에 이뤄지지 않는다는 의미이다.

요청을 하고 나서 결과를 기다리지 않기 때문에, 그 동안 다른 일을 할 수 있어 효율적인 프로세스 구성을 할 수 있다.

그래서 등장한 개념이
```java
Future<>
Promise<> //얘는 안쓰임.
```
같은 놈들이다.

`Future<>`은 말 그대로 결과가 미래에 온다는 것이다. 

우리는 보통 코드를 구성할 때 함수 리턴 값을 받아 곧바로 사용한다.
```java
int a = someCalculation();
System.out.println(a);
```
그러나 비동기의 경우 결과가 언제 올지 모르기 때문에
```java
Future<int> a = someCalculationAsync();
```
이런 식으로 받아야 한다.

그리고 그 `Future<int>`가 값이 유효해질 때, 어떠한 동작을 하겠다고 예약을 해놓는 방식으로 동작하게 된다.

```java
Future<int> a = someCalculationAsync();
a.then((value) => System.out.println(value)); //유효해지면 출력해라
```
이후에 Vert.x 포스트에서 매우 빈번히 등장할테니, 미리 한번 눈에 익혀두는 것을 추천한다.

## Vert.x 구조

개인적인 경험으로, 이해 안가는 글을 붙잡고 읽는 것 보단 그냥 직접 짜보고 버그와 한바탕 싸우면 훨씬 빠르게 이해할 수 있다.

그래서 정말 간단하게, *이걸 모르면 Vert.x를 시작할 수도 없다!* 정도만 소개하려고 한다. 

### 1. Verticle 이란?

Vert.x 의 알파이자 오메가이다.

Verticle은 Vert.x 에서 독립적으로 돌아가는 하나의 프로그램을 말한다.

뭔 소린가 싶을텐데, 서버를 하나 만든다고 생각해보자.

이 서버를 기능 단위의 프로그램으로 자르면 
- 서버로 오는 요청을 받아서 해석하는 프로그램
- 데이터 베이스와 소통하는 프로그램

이렇게 자를 수 있다.

이런 각각의 프로그램을 **Verticle** 이라고 한다. 

물론 더 세부적으로 자를 수 있다. 그냥 개발자가 여기까지 이 프로그램의 기능이야! 라고 정해서 만들어낸 프로그램이 Verticle 이라고 생각하면 된다.

### 2. Worker Verticle 이란?

상당히 중요한 점은, Verticle은 **Single Thread** 로 동작한다.

이 말인 즉슨, 한 Verticle에 요청이 1000개가 들어왔다면, 이 1000개를 순차적으로 처리한다는 것이다.

여기서 끔찍한 가정을 해보자. 한 요청을 처리하는데 10초가 걸린다면?

마지막 요청에 대한 응답을 무려 **20000초** 뒤에나 받을 수 있다.

이런 일이 벌어진다면 서버는 터질 것이고, 문의 사항은 빗발치며 개발자는 다음 날 아침에 자리가 없어져 있을지도 모른다.

> 아니 Vert.x 는 엄청 빠르다면서요??

맞다. 하지만 일반 Verticle 만으로는 불충분하다. 바로 여기서 **Worker Verticle** 이 등장한다.

**Worker Verticle**은 말 그대로, 일하는 프로그램이다. 

**Multi thread** 로 동작하기 때문에 위와 같은 큐잉 문제가 발생하지 않는다!

그래서 일반 Verticle은 오래 걸리는 일 (DB 같은) 을 Worker 에게 토스한다.

### 3. Event Bus 란?

그럼 여기서 의문점이 생긴다.

> 그럼 각 Verticle 끼린 어떻게 소통해요?

이를 위해 Vert.x 는 **Event Bus**라는 기능을 제공한다.

보통 Bus 는 공용으로 사용하는 통로라는 개념이다.

곧, 이벤트를 주고받는 큰 통로를 제공해준다는 것이다.

![Vertx 구조도][3]

![Vertx 구조도2][4][^1]

위 그림 들을 보면 이해가 대충 갈 것이다.

시간이 오래 걸리는 일을 Worker Verticle 에게 토스하고 일반 Verticle 은 다른 요청을 처리한다.

어디서 들어본 것 같지 않은가?

맞다. **비동기** 동작이다.

그래서 기본적인 Vert.x 의 흐름은 요청을 받고, 이벤트 버스에 이벤트를 던지고, 이벤트 처리 후 핸들러를 통해 응답한다.

간단히 코드로 보면 아래와 같다.

```java
//보내기
vertx.eventBus().request("mysql")
    .onSuccess(reply -> {
        return200(context, "성공");
    })
    .onFailure(replyThrowable -> {
        return400(context, "실패");
    });

//받기
vertx.eventBus().consumer("mysql", message -> {
  System.out.println("I have received a message: " + message.body());
});
```

지금까지 굉장히 간단하게 Vert.x를 알아보았다.

아마 이해하기 어려울 수도 있다. 일단 대충 이해하고, 이후 포스트들을 따라하면서 실전적으로 익히고 나서 다시금 돌아보면 그때 아아아아 할 것이다.

조금 더 깊은 원리를 이해하고 싶으면, 아래의 블로그를 추천한다. 매우 잘 되어있다.

[조대협 님 블로그][5]

[1]: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Vert.x_Logo.svg/1200px-Vert.x_Logo.svg.png
[2]: https://github.com/githajae/ClearApp_BE "clearApp_BE"
[3]: /assets/vertx/verticle_desc.png
[4]: /assets/vertx/vertx_arch.jpg
[5]: https://bcho.tistory.com/860

[^1]: https://www.slideshare.net/VictorHugo35/reactive-applications-and-microservices-with-vertx-toolkit-56215179