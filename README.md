# 방꾸미 2.0 · 작업 진행 상황

방꾸미 2.0을 만드는 작업이 어디까지 왔는지 보여 주는 한 장짜리 페이지입니다.

- 보기: https://tomask0907-eng.github.io/bangkkumi2-progress/
- 내용은 `progress.json` 한 파일에 들어 있고, 페이지가 약 1분 30초마다 새로 읽습니다.

## 갱신 방법

```bash
node update.mjs --set s2-api=doing --now "서버 기능 뼈대를 만들고 있어요"
node update.mjs --set s2-api=done --log "서버 기능 뼈대를 마쳤어요"
```

상태 값은 `todo`(대기), `doing`(진행 중), `done`(완료), `wait`(기다리는 중), `skip`(건너뜀)입니다.
명령을 실행하면 `progress.json`을 고치고 커밋한 뒤 바로 올립니다. `--no-push`를 붙이면 올리지 않습니다.
