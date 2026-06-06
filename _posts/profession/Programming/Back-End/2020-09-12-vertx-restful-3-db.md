---
title: "&#91;Vert.x&#93; RESTful API (3) - DB 연결"
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

![Vertx 로고][I_1]

## 0. 이전 포스트

  - [기본적인 **RESTful API** 의 구현][P_1]

  - [**JWT** 로 보안 구현하기 (Authentication 구현)][P_2]

## 1. Maven 설정

위 포스팅에서는 Vert.x의 [Reactive MySQL Client][L_1] 를 이용해서 DB 와 연동해 볼 것이다.

Maven 에 아래 코드를 추가해주자.

```xml
<dependency>
    <groupId>io.vertx</groupId>
    <artifactId>vertx-mysql-client</artifactId>
</dependency>
```
사실 굳이 이 라이브러리를 이용해서 DB 와 연동할 필요는 없다.

Service 를 Worker Verticle 로 만들기만 하면 다른 방법으로 (ex : Spring + MyBatis (국룰)) 구현해도 아무 상관없다.

오히려 나는 그 편을 권장한다.

이 라이브러리를 좀 쓰다보면 알겠지만 일일이 connection 을 얻어야 하고, SQL 문 string 으로 쳐서 넣어야 하고.. 꽤나 구식이다.

나는 Spring 에 익숙하지 않아서 Vertx-Jooq 를 사용하고 있다.

개발자가 공인한, Vertx 의 장점을 온전히 누릴 수 있는 라이브러리다. 

## 2. Table 생성하기

이번 포스트에서 구현해 볼 것은 로그인이다.

Id 와 Password 를 받으면 DB 를 통해 유효성을 검증한 뒤 이름을 반환할 것이다.

적당한 Table 을 만들고 테스트 데이터를 집어넣자.

```sql
CREATE TABLE users (
	id VARCHAR(20),
	pass VARCHAR(30),
	name VARCHAR(10)
);

INSERT INTO users
VALUES('test', 'testpassword', '하재현');
```

## 3. API 규칙 작성

로그인 API 의 과정은 이렇다.

`POST /login` 으로 요청을 보낸다.

이때 body 는 아래와 같은 포맷을 갖추어야만 한다.

```json
{
    "id":"STRING",
    "pass":"STRING"
}
```

Routing Handler 는 위 요청을 받고, Event Bus 를 통해 Service Handler 에게 DB 확인을 해달라고 요청한다.

Service Handler 는 DB 에서 해당 id / pass 쌍을 조회해보고, 유효하다면 이름을 반환하고 그렇지 않다면 실패를 반환한다.

응답을 받은 Routing Handler 는 Json 의 형태로 결과를 표시한다.

API 구현을 하기 전 위와 같은 흐름을 문서화 해놓는 것은 필수적이다.

문서화 작업을 하지 않고 무작정 작업하면 나중에 수정 사항이 생길때마다 피눈물을 흘리게 된다.

## 4. Routing Handler 구현

이전 포스트 처럼 `BodyHandler` 를 등록해주고 `POST /login` 핸들러를 등록해주자.

```java
Router router = Router.router(vertx);
router.route().handler(BodyHandler.create());
router.post("/login").handler(this::login);
```

로그인 핸들러는 Event Bus 를 통해 Service Handler 에게 요청을 한다.

로그인 핸들러는 Service Handler 가 String 형태로 name 을 반환하길 기대한다.

참고로 Event Bus 로 요청을 보내는 방법은 3가지가 있다.

- send : 1 : 1 송신 / 반환 핸들링 X
- publish : 1 : n 송신 / 반환 핸들링 X
- request : 1 : 1 송신 / 반환 핸들링 O

우리는 반환을 받아 사용자에게 보내는 핸들링 작업을 해야하므로 request 를 사용해야 한다.

규약 상으로 반환은 json 의 형태임을 고려하여 아래와 같이 작성하자.

```java
private void login(RoutingContext context){
    vertx.eventBus().request("login", context.getBodyAsJson(), reply -> {
        if(reply.succeeded()){
        context.response()
            .setStatusCode(200)                
            .putHeader("content-type", "application/json; charset=utf-8")
            .end(new JsonObject().put("name", ((String) reply.result().body())).encodePrettily());
        }else{
        reply.cause().printStackTrace();
        context.response()
            .setStatusCode(400)                
            .putHeader("content-type", "application/json; charset=utf-8")
            .end(new JsonObject().put("err", "로그인 실패").encodePrettily());
        }
    });
}
```

## 5. Client Pool 생성

이제 DB Service 를 처리하기 위한 Service Verticle 을 생성할 것이다.

Reactive MySQL Client 은 자체적으로 비동기 처리를 하므로 굳이 Worker Verticle 로 만들 이유는 없다.

우선 간단한 Service Verticle 을 만들자. 

```java
public class ServiceVerticle extends AbstractVerticle {
    MySQLPool client;
  
    @Override
    public void start() throws Exception {
    }
}
```

DB 와 소통하기 위해서는 client pool 을 생성해야 한다.

아래의 코드처럼 pool 을 얻어주자.

```java
public class ServiceVerticle extends AbstractVerticle {
    MySQLPool client;
  
    @Override
    public void start() throws Exception {
      MySQLConnectOptions connectOptions = new MySQLConnectOptions()
        .setPort(3306)
        .setHost("localhost")
        .setDatabase("test")
        .setUser("root")
        .setPassword("root");
  
      PoolOptions poolOptions = new PoolOptions()
        .setMaxSize(5);
  
      client = MySQLPool.pool(vertx, connectOptions, poolOptions);
    }
}
```
size 가 5인 pool 이 생성되었다.

이제 필요할 때면 이 pool 에서 연결을 받아오면 된다.

이제 이 Verticle 을 deploy 해야 한다. main 문에서 deploy 하자

```java
public static void main(String[] args) {
    Vertx.vertx().deployVerticle(new MainVerticle()); //이전 글 참고
    Vertx.vertx().deployVerticle(new ServiceVerticle());
}
```

## 6. Event Bus Consumer 구현

이제 Service Verticle 에서 Event Bus Consumer 를 구현해보자.

구현할 Consumer 은 유효한 아이디 패스워드일 경우 이름을 반환하고, 그렇지 않으면 fail 을 반환할 것이다.

핸들링할 메소드는 아래와 같다.

```java
public void login(Message<JsonObject> message){
    String id = message.body().getString("id");
    String pass = message.body().getString("pass");

    client
    .preparedQuery(
        "SELECT name FROM users WHERE id=? AND pass=?"
    )
    .execute(Tuple.of(id, pass), result -> {
        if(result.succeeded()){
            if(result.result().size() == 1){
                String name = result.result().iterator().next().getString("name");
                message.reply(name);
            }else{
                message.fail(-2, "유효하지 않은 로그인 정보");
            }
        }else{
            message.fail(-1, "쿼리 실패");
        }
    });
}
```

구조는 간단하다.

Routing Handler 에서 `context.getBodyAsJson()` 를 메세지의 내용으로 보내줬으므로 `message.body()` 로 얻어준다.

그리고 `MySQLPool client` 를 통해 쿼리를 실행하면 된다.

이때 반환값이 좀 독특하다.

`RowSet<Row>` 라는 걸 반환하는데, 말 그대로 Row 의 set 이다.

주요 사용법은 다음과 같다.

- `rowCount()` 를 통해 affected row count 받아오기 (row 개수가 아님에 주의!)
- `iterator()` 를 통해 row 순회하며 정보 받아오기

위 코드에서는 한 개의 row 가 반환되길 기대하므로 이 조건을 체크하고, `iterator().next().getString` 을 통해 이름을 가져와 반환한다.

이제 이 핸들링 메소드를 Event Bus 에 등록해주자.

```java
@Override
public void start() throws Exception {
    MySQLConnectOptions connectOptions = new MySQLConnectOptions()
    .setPort(3306)
    .setHost("localhost")
    .setDatabase("test")
    .setUser("root")
    .setPassword("root");

    PoolOptions poolOptions = new PoolOptions()
    .setMaxSize(5);

    client = MySQLPool.pool(vertx, connectOptions, poolOptions);

    vertx.eventBus().consumer("login").handler((message) -> {
        try {
            Method m = this.getClass().getDeclaredMethod("login", Message.class);
            m.invoke(this, message);
        } catch (Exception e) {
            e.printStackTrace();
        }
    });
}
```

여기서 굳이 Reflection 을 사용할 필요는 없다.

다만  `message` 의 클래스가 `Message<Object>` 라서 `Message<JsonObject>` 로 변환이 안되어 약간의 트릭을 썼을 뿐이다.

그리고 이후에 포스팅하겠지만 Reflection 을 이용한 아키텍쳐를 소개하기 위한 빌드업이다 ㅎ..

Reflection 은 그냥 호출하는 것 보다 느리기 때문에 속도에 민감하면 그냥 호출하는 방식으로 바꾸길 권장한다.

[공식 문서][L_2]도 아래와 같이 설명하고 있다.

> Because reflection involves types that are dynamically resolved, certain Java virtual machine optimizations can not be performed. Consequently, reflective operations have slower performance than their non-reflective counterparts, and should be avoided in sections of code which are called frequently in performance-sensitive applications.

## 7. 테스트 해보기

Postman 을 키자.

`POST /login` 으로 

```json
{
    "id":"test",
    "pass":"testpassword"
}
```

를 보내보자.

![로그인 성공][I_2]

성공적으로 반환되었다.

이제 이상한 정보를 보내보자.

```json
{
    "id":"test",
    "pass":"wrongpassword"
}
```

![로그인 실패][I_3]

성공적으로 실패했다.

이렇게 기본적인 DB 연동법을 알아보았다.

조금 구체적인 Reactive MySQL Client 사용법은 부록 느낌으로 차차 올릴 예정이다.

위에서 사용한 코드들은 [github 프로젝트][L_3]에서 확인할 수 있다.

[I_1]: https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Vert.x_Logo.svg/1200px-Vert.x_Logo.svg.png
[I_2]: /assets/vertx/example3/1.PNG
[I_3]: /assets/vertx/example3/2.PNG

[L_1]: https://vertx.io/docs/vertx-mysql-client/java/
[L_2]: https://docs.oracle.com/javase/tutorial/reflect/index.html
[L_3]: https://github.com/githajae/Vertx_Examples/tree/master/src/main/java/com/yshajae/vertx/example3

[P_1]: {% post_url profession/Programming/Back-End/2020-08-29-vertx-restful-1-routing %}
[P_2]: {% post_url profession/Programming/Back-End/2020-08-30-vertx-restful-2-jwt %}