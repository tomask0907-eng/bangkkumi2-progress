#!/usr/bin/env node
// 진행 상황 갱신 도구: progress.json을 고친 뒤 커밋하고 올린다.
//
// 사용법 (여러 옵션을 한 번에 줄 수 있다):
//   node update.mjs --set s2-api=doing --now "서버 기능 뼈대를 만들고 있어요"
//   node update.mjs --set s2-api=done --note "s2-api=테스트 12개 통과" --log "서버 기능 뼈대 완료"
//   node update.mjs --add "s3:s3-fix2:추가로 찾은 문제 고치기" --task "새 큰 작업 이름" --no-push
// 상태 값: todo(대기) doing(진행 중) done(완료) wait(기다리는 중) skip(건너뜀)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = import.meta.dirname;
const file = path.join(dir, 'progress.json');
const lockDir = path.join(dir, '.update.lock');
const STATES = new Set(['todo', 'doing', 'done', 'wait', 'skip']);

function fail(message) {
  console.error(`진행 상황 갱신 실패: ${message}`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const ops = { set: [], note: [], add: [], log: [], now: null, task: null, push: true };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--no-push') { ops.push = false; continue; }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} 뒤에 값이 없어요`);
    i += 1;
    if (flag === '--set' || flag === '--note') {
      const at = value.indexOf('=');
      if (at < 1) throw new Error(`${flag} 값은 "id=값" 꼴이어야 해요: ${value}`);
      ops[flag.slice(2)].push([value.slice(0, at), value.slice(at + 1)]);
    } else if (flag === '--add') {
      const [stageId, id, ...rest] = value.split(':');
      if (!stageId || !id || rest.length === 0) throw new Error(`--add 값은 "단계id:항목id:제목" 꼴이어야 해요: ${value}`);
      ops.add.push({ stageId, id, title: rest.join(':') });
    } else if (flag === '--log') ops.log.push(value);
    else if (flag === '--now') ops.now = value;
    else if (flag === '--task') ops.task = value;
    else throw new Error(`모르는 옵션이에요: ${flag}`);
  }
  return ops;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// 여러 작업이 동시에 부를 수 있어서 폴더 하나를 자물쇠로 쓴다.
function withLock(run) {
  for (let attempt = 0; ; attempt += 1) {
    try { fs.mkdirSync(lockDir); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const ageMs = Date.now() - fs.statSync(lockDir, { throwIfNoEntry: false })?.mtimeMs;
      if (ageMs > 120000) { fs.rmSync(lockDir, { recursive: true, force: true }); continue; }
      if (attempt > 120) throw new Error('다른 갱신이 끝나지 않아요 (2분 기다림)');
      sleep(1000);
    }
  }
  try { return run(); } finally { fs.rmSync(lockDir, { recursive: true, force: true }); }
}

function findItem(data, id) {
  for (const stage of data.stages) {
    const item = (stage.items ?? []).find((entry) => entry.id === id);
    if (item) return item;
  }
  return (data.waitingForUser ?? []).find((entry) => entry.id === id) ?? null;
}

function apply(data, ops) {
  for (const { stageId, id, title } of ops.add) {
    const stage = data.stages.find((entry) => entry.id === stageId);
    if (!stage) throw new Error(`없는 단계예요: ${stageId}`);
    if (findItem(data, id)) throw new Error(`이미 있는 항목이에요: ${id}`);
    stage.items.push({ id, title, status: 'todo' });
  }
  for (const [id, status] of ops.set) {
    if (!STATES.has(status)) throw new Error(`모르는 상태예요: ${status}`);
    const item = findItem(data, id);
    if (!item) throw new Error(`없는 항목이에요: ${id}`);
    item.status = status;
  }
  for (const [id, note] of ops.note) {
    const item = findItem(data, id);
    if (!item) throw new Error(`없는 항목이에요: ${id}`);
    if (note) item.note = note; else delete item.note;
  }
  const at = new Date().toISOString();
  if (ops.now !== null) data.now = ops.now;
  if (ops.task !== null) data.task = ops.task;
  data.log = [...ops.log.map((text) => ({ at, text })).reverse(), ...(data.log ?? [])].slice(0, 40);
  data.updatedAt = at;
}

function git(args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function publish(summary) {
  git(['add', 'progress.json']);
  if (!git(['status', '--porcelain', 'progress.json']).trim()) return;
  git(['commit', '-q', '-m', `진행 상황 갱신: ${summary}\n\nCo-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`]);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { git(['push', '-q', 'origin', 'main']); return; } catch (error) {
      if (attempt === 3) { console.error(`올리지 못했어요(다음 갱신 때 함께 올라가요): ${String(error.stderr || error.message).trim()}`); return; }
      sleep(2000);
    }
  }
}

try {
  const ops = parseArgs(process.argv.slice(2));
  withLock(() => {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    apply(data, ops);
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    const summary = ops.log.at(-1) ?? ops.now ?? ops.set.map(([id, status]) => `${id} ${status}`).join(', ') ?? '내용 고침';
    if (ops.push) publish(summary || '내용 고침');
  });
  if (!process.exitCode) console.log('진행 상황을 갱신했어요.');
} catch (error) {
  fail(error.message);
}
