---
title: "&#91;Vert.x&#93; RESTful API (2) - JWT로 AuthN 구현"
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

## 0. 이전 포스트

  - [기본적인 **RESTful API** 의 구현][p1]

## 1. AuthN 이란?

항상 찾아보면서 헷갈렸다. 

Authentication(AuthN)과 Authorisation(AuthZ).. 너무 이름이 비슷하다.

- AuthN : 유효한 유저인지 체크 (ex: 로그인 정보)

- AuthZ : 유저가 권한이 있는지 체크 (ex: 어드민인가?)

이 중에서 오늘 구현해볼 것은 JWT 를 이용한 AuthN 이다.

JWT 는 모든 정보를 토큰에 저장하는 방식이라 별도의 인증 저장소가 필요 없다는 장점이 있다.

자세한 설명은 아래의 블로그들을 읽어보는 걸 추천한다.

[Velopert 님 블로그][2]

[Hyuntae Hwang 님 블로그][3]

## 2. HS256 을 이용해서 JWT 토큰 발급하기

시작하기 전 pom.xml 에 아래의 dependency를 추가해주자.

```xml
<dependency>
    <groupId>io.vertx</groupId>
    <artifactId>vertx-auth-jwt</artifactId>
</dependency>
```

JWT 를 사용하기 위해서 필요한 것은 Auth Provider 를 만들어주는 것이다.

Provider 는 JWT 토큰 생성 및 복호화에 쓰이는 설정을 제공해준다.

지난 시간에 쓰이던 코드 위에 구현해보자.

Provider 를 멤버 변수로 선언하고, 초기화를 하자.

```java
public class MainVerticle extends AbstractVerticle {
    private JWTAuth provider;

    private void initProvider(){
        provider = JWTAuth.create(vertx, new JWTAuthOptions()
            .addPubSecKey(new PubSecKeyOptions()
            .setAlgorithm("HS256")
            .setPublicKey("ppppaaaassssswwwwoooorrrdddd")
            .setSymmetric(true)));
    }
}
```

이렇게 하면 deprecated 되었다고 줄이 그인다. 별 상관없으니 무시하면 된다.

(4.0.0 버전부터는 setBuffer() 를 통해 key 를 설정해야 한다.)

그냥 위의 예제대로 하면 된다.

다음으로 로그인 `GET /login` 으로 요청이 오는 경우 토큰을 발급해주자.

```java
router.get("/login").handler(this::generateToken);
```

```java
private void generateToken(RoutingContext context){
    String token = provider.generateToken(new JsonObject().put("name", "하재현").put("studentId", 20180000));
    context.response()
        .setStatusCode(200)
        .putHeader("content-type", "text/plain; charset=utf-8")
        .end(token);
}
```

적당히 내용을 집어넣어서 토큰을 만든 후, 보내준다.

Postman 으로 확인해보자.

![JWT 토큰 발급 확인][4]

토큰이 만들어진 것을 확인할 수 있다. 

유효한 토큰인지, 그리고 내용을 확인하기 위해 [이 사이트][5]에 들어가서 토큰을 넣어보자.

![JWT 사이트에서 복호화][6]

올바르게 값이 들어가있다!

## 3. AuthN 구현하기

토큰을 발급했다면, 이제 사용자의 토큰이 유효한지 검증해야 한다.

Vert.x 는 친절하게 `JWTAuthHandler` 라는 편리한 핸들링 클래스를 제공해준다.

전 시간에 만들었던 `/user` 경로에 AuthN 을 추가해보자.

```java
router.get("/user").handler(JWTAuthHandler.create(provider)); // 상위에 있어야 함!
router.get("/user").handler(this::getUsers);
router.get("/user/:id").handler(this::getById);
```

`/user` 로 시작하는 `GET` 요청은 AuthN 과정을 거쳐야 한다. 

`JWTAuthHandler` 는 인증이 성공하면 디코딩 정보를 `context` 의 `user` 에 넣어주고 `context.next()` 를 호출 해 다음 핸들링으로 넘어간다. 

`user` 가 잘 들어갔는지 확인해보자.

```java
private void getUsers(RoutingContext context) {
    JsonObject user = context.user().principal();

    context.response()
      .setStatusCode(200)                
      .putHeader("content-type", "text/plain; charset=utf-8")
      .end("AuthN pass : "+user.getString("name")+", "+user.getInteger("studentId"));
}
```

Postman 의 Authorization 탭에 들어가 Bearer Token 을 선택하고, 발급받은 토큰을 넣어주자.

![AuthN 통과 및 User 확인][7]

AuthN 이 성공하고, User 가 성공적으로 들어갔음이 확인된다.

## 4. FailureHandler 구현하기

간혹 인증이 실패했을 때 추가적인 행동을 해야하는 경우가 있다. 

재 인증을 위해 리다이렉트를 하라고 한다던가, 반환을 JSON 으로 해야한다던가.

이를 위해서는 `FailureHandler` 를 별도로 구현해야 한다.

Router 에 `FailureHandler` 를 등록해주자.

```java
router.route().failureHandler(this::failureHandler);
```

`JWTAuthHandler` 는 인증이 실패하면 `context.fail(new HttpStatusException(401))` 을 호출한다.

```java
private void failureHandler(RoutingContext context){
    int statusCode = context.statusCode();
    String errorMessage;
    if(context.failure() instanceof HttpStatusException){
        errorMessage = "인증이 만료되었으니 다시 하시길 바랍니다.";
    }else{
        errorMessage = "Unkown Error";
    }
    JsonObject errInfo = new JsonObject().put("err", errorMessage);

    context.response()
      .setStatusCode(statusCode)                
      .putHeader("content-type", "application/json; charset=utf-8")
      .end(errInfo.encodePrettily());
}
```

올바르지 않은 토큰을 줘서 확인해보자.

![failureHandler 동작 확인][8]

올바르게 JSON 형태로 반환되었다.

## 5. 올바른 Key 관리

지금은 코드 내에 Key 를 하드 코딩 했지만, 프로덕션 레벨에서는 절대로 그래서는 안된다.

Key 를 파일로 저장해서, 주기적으로 교체할 수 있도록 해야한다.

그리고 파일로 저장했다면 `.gitignore` 에 추가하는 것을 잊지 말자.

최근에 이걸 깜빡해서 하루 동안 생고생을 했던 기억이 있다..

위에서 사용한 코드들은 [github 프로젝트][10]에서 확인할 수 있다.

[1]: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Vert.x_Logo.svg/1200px-Vert.x_Logo.svg.png
[2]: https://velopert.com/2389
[3]: https://medium.com/neillab/what-is-jwt-89889759ae37
[4]: /assets/vertx/example2/1.PNG
[5]: https://jwt.io/
[6]: /assets/vertx/example2/2.PNG
[7]: /assets/vertx/example2/3.PNG
[8]: /assets/vertx/example2/4.PNG
[9]: https://blog.naver.com/PostView.nhn?blogId=baekmg1988&logNo=221454486746
[10]: https://github.com/githajae/Vertx_Examples/tree/master/src/main/java/com/yshajae/vertx/example2

[p1]: {% post_url profession/Programming/Back-End/2020-08-29-vertx-restful-1-routing %}