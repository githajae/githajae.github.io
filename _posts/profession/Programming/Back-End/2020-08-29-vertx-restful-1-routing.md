---
title: "&#91;Vert.x&#93; RESTful API (1) - Routing 구현"
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

## 1. Vert.x로 RESTful API를 만들어보자 프로젝트

Vert.x 는 설명했듯, 비동기 서버 프레임워크다.

특히나, API 를 제작하는 데 있어서 상당히 훌륭한 프레임워크다.

그래서 [클리어 어플리케이션 RESTful API][2] 가 Vert.x 를 기반으로 제작되고 있다.

나는 위 프로젝트를 진행하면서 배웠던 것들을 차근차근 블로그에 작성하고자 한다!

현재 계획 중인 목차는 이렇다.

  - [기본적인 **RESTful API** 의 구현][p1]

  - [**JWT** 로 보안 구현하기 (Authentication 구현)][p2]

  - [**DB** 와 연동하기][p3]

  - **Spring Boot** 와 연동하기

  - **Vertx-Jooq** 의 사용

  - **자동 메일 발송** 구현하기

이 외에도 아이디어가 떠오르면 작성해볼 예정이다.


## 2. RESTful API 란?

RESTful API 란 **REST** 특징을 지키면서 API를 작성하는 것을 말한다.

> 어떤 자원에 대해 CRUD(Create, Read, Update, Delete) 를 수행하기 위해 URI(Resource)로 요청을 보내는 것

이것이 REST 의 정의인데, 사실 좀 배경 지식이 없으면 이해하기 어렵다.

간단하게 설명하자면

1. 서버가 관리하는 자원이 있다<br>
```
유저 정보 데이터베이스
주문 정보 데이터베이스
```


2. 이 자원을 URI 로 표시한다<br>
```
/users
/orders
```


3. 이 자원에 대한 행위를 HTTP method로 표현한다<br>
```java
httpClient.get("/users") // 유저 정보 가져오기
httpClient.delete("/users/:id") // id가 :id 인 유저 삭제히기
httpClient.get("/orders") // 주문 정보 가져오기
httpClient.post("/orders", body) // 주문 추가하기
```

4. 이런 자원을 특정한 포맷으로 (JSON, XML ...) 주고받는다.<br>
```json
"user": {
    "name":"하재현",
    "studentId":20000000
}
```

이정도만 알고 있어도 블로그 글을 따라오는데 문제는 없겠지만, 좀 더 자세하게 알고 싶으신 분들은 아래 블로그들을 참고하면 좋을 것 같다.

[망나니 개발자님 블로그][3]

[가그린 민트님 블로그][4]

## 3. HTTP Server 을 열어보자

사실 Vert.x 프로젝트를 열어보면 HTTP Server를 여는 코드는 이미 잘 짜져있다.

```java
public class MainVerticle extends AbstractVerticle {
  @Override
  public void start(Promise<Void> startPromise) throws Exception {
    vertx.createHttpServer().requestHandler(req -> {
      req.response()
        .putHeader("content-type", "text/plain")
        .end("Hello from Vert.x!");
    }).listen(8888, http -> {
      if (http.succeeded()) {
        startPromise.complete();
        System.out.println("HTTP server started on port 8888");
      } else {
        startPromise.fail(http.cause());
      }
    });
  }
}
```

Main 문을 작성해서 한 번 돌려보자. 같은 클래스에 작성하면 된다.

```java
public class MainVerticle extends AbstractVerticle {
  public static void main(String[] args) {
    Vertx.vertx().deployVerticle(new MainVerticle());
  }
}
```

간단하게 해석해보자.

Vert.x 에서 프로그램의 단위는 Verticle 이다.

그 프로그램 단위인 `MainVerticle`을 작성했다면, 이것을 배포(deploy)해야 JVM 위에서 돌아가게 될 것이다.

이때 배포해주는 함수가 `vertx.deployVerticle()` 이다.

이외에도 `Launcher`를 이용해서 deploy 할 수 있는데, 이건 나중에 알아보도록 하겠다.

여튼 배포의 마지막 과정으로 `start()` 함수를 거치는데, 보통 이 함수에서 Verticle이 해야 할 동작을 작성한다.

1. `createHttpServer()` 함수로 HTTP Server를 연다

2. `requestHandler()` 로 요청에 대한 핸들링을 정의한다.

3. `listen()` 으로 요청을 받을 port 와 이런 과정이 모두 끝났을 때의 핸들링을 정의한다.

한 번 올바르게 열렸는지 테스트해보자. 

[Postman][5] 을 사용할 것이다.

![Postman 리퀘스트 응답][6]

localhost:8888 로 보내보니 응답이 잘 들어오는 것을 확인 할 수 있다.

## 4. 간단한 API 를 작성해보자

리소스가 없으니 RESTful 이라고 하긴 뭐해서 그냥 API 라고 했다.

요청 경로 별로 다른 응답을 하도록 코드를 작성할 것이다.

이를 위해서는 `Router` 라는 것을 써야한다.

그전에 Vert.x web dependency 를 추가해주자.

```xml
<dependency>
 <groupId>io.vertx</groupId>
 <artifactId>vertx-web</artifactId>
</dependency>
```

Router를 만들고, Body Handler 를 모든 경로에 대해 등록해주자.

```java
Router router = Router.router(vertx);
router.route().handler(BodyHandler.create()); 
```

Body Handler는 body 를 받을 수 있도록 해준다. 잘 응용하면 Body 크기 제한 등 여러가지 제약을 걸 수 있다.

우선 2가지 경로에 대한 응답 코드를 작성해보자.

```java
router.get("/user").handler(this::getUsers);
router.get("/user/:id").handler(this::getById);
```

```java
private void getUsers(RoutingContext context) {
    context.response()
        .setStatusCode(200)                
        .putHeader("content-type", "text/plain; charset=utf-8")
        .end("Got Users!");
}

private void getById(RoutingContext context) {
    String id = context.pathParam("id");
    context.response()
        .setStatusCode(200)                
        .putHeader("content-type", "text/plain; charset=utf-8")
        .end("Got User " + id + " !" );
}
```

그리고 HTTP Server 에 Router 를 등록시켜주자

```java
vertx.createHttpServer().requestHandler(router).listen(8888);
```

지금까지 `Router`를 통해 `GET /user` 과 `GET /user/:id` 로 들어오는 요청을 핸들링했다. 

Header 를 넣는 걸 잊지 말자. 인코딩을 잘못 지정해주면 한글이 깨질 수도 있다.

마찬가지로 `Postman` 으로 테스트해보자.

![user 테스트][7]

![user/id 테스트][8]

잘 작동한다.

혹시라도 **Hello from Vert.x!** 를 받는 분이 있으시다면, 기존의

```java
vertx.createHttpServer().requestHandler(req -> {
      req.response()
        .putHeader("content-type", "text/plain")
        .end("Hello from Vert.x!");
    }
```

를 지우고

```java
vertx.createHttpServer().requestHandler(router)
```

로 바꾸었는지 확인해보자. 당연히 Router 를 등록시켜야 제대로 동작한다!

## 5. 한 경로에 여러 핸들러 등록하기

만약에 모든 경로가 특정한 핸들링을 거쳐야 한다면 어떻게 구현해야 할까?

예를 들어 보안을 위해 인증서를 확인한다던가.

모든 핸들러에 개별적으로 구현하는 것은 너무 비효율적이다.

그래서 Vert.x 는 한 경로에 여러 핸들러를 등록할 수 있도록 하고있다.

모든 경로에 대한 요청이 지나가는 핸들러를 만들자. 

상위 핸들러부터 순서대로 등록해야 한다. 먼저 등록한 핸들러가 우선순위가 높다.

```java
router.route().handler(BodyHandler.create()); 
router.route().handler(this::rootHandler); //이거 추가
router.get("/user").handler(this::getUsers);
router.get("/user/:id").handler(this::getById);
```

```java
private void rootHandler(RoutingContext context){
    context.put("name", "하재현").next();
}
```

`rootHandler` 는 모든 경로에 대한 요청을 받아서, context 에 값을 집어넣고, 다음으로 매칭하는 핸들러로 요청을 넘겨준다.

요청이 잘 넘어갔는지 확인하기 위해 다른 핸들러를 수정해보자.

```java
private void getUsers(RoutingContext context) {
    context.response()
        .setStatusCode(200)                
        .putHeader("content-type", "text/plain; charset=utf-8")
        .end("Got Users! " + "By " + context.get("name"));
}
private void getById(RoutingContext context) {
    String id = context.pathParam("id");
    context.response()
        .setStatusCode(200)                
        .putHeader("content-type", "text/plain; charset=utf-8")
        .end("Got User " + id + " !" + "By " + context.get("name"));
}
```

정상적으로 동작한다면 하재현이 출력되어야 할 것이다. 확인해보자.

![vertx 핸들러 delegate 테스트][9]

잘 출력된다!

이렇게 `context.next()` 를 이용해서 한 경로에 대해 여러 핸들러를 거치도록 구현할 수 있다.

이후에 **JWT 인증 구현하기** [에서]() 주로 사용하게 될 기술이다!

이 글에 사용한 소스들은 [github 프로젝트][10]에 확인할 수 있다.

[1]: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Vert.x_Logo.svg/1200px-Vert.x_Logo.svg.png
[2]: https://github.com/githajae/ClearApp_BE "clearApp_BE"
[3]: https://mangkyu.tistory.com/46
[4]: https://brainbackdoor.tistory.com/53
[5]: https://www.postman.com/
[6]: /assets/vertx/example1/1.PNG
[7]: /assets/vertx/example1/2.PNG
[8]: /assets/vertx/example1/3.PNG
[9]: /assets/vertx/example1/4.PNG
[10]: https://github.com/githajae/Vertx_Examples/tree/master/src/main/java/com/yshajae/vertx/example1

[p1]: {% post_url profession/Programming/Back-End/2020-08-29-vertx-restful-1-routing %}
[p2]: {% post_url profession/Programming/Back-End/2020-08-30-vertx-restful-2-jwt %}
[p3]: {% post_url profession/Programming/Back-End/2020-09-12-vertx-restful-3-db %}