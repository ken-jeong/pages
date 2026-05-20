// Visual snapshots describe the same completed events as the packet timeline.
function tcpScenarioGroup(scenario) {
  if (scenario.startsWith('congestion')) return 'congestion';
  return ['loss', 'corrupt', 'ack-loss', 'fast'].includes(scenario) ? 'loss' : scenario;
}

function tcpMechanismState(scenario, trace, step) {
  const current = trace[step];
  if (scenario === 'flow') {
    const contents = [[], ['A'], ['A'], ['A', 'B'], ['A', 'B'], ['A', 'B'], ['B'], ['B'], ['B', 'C'], ['B', 'C'], [], []][step];
    return { mode: 'flow', contents, delivered: step >= 10 ? ['A', 'B', 'C'] : step >= 6 ? ['A'] : [], blocked: current.rwnd === 0, read: step === 6 || step === 10 };
  }
  if (scenario.startsWith('congestion')) {
    // Queue occupancy is an illustrative sub-event, not a value inferred from cwnd.
    const loss = step === 11;
    return { mode: 'congestion', sent: current.packet?.direction === 'right' ? (step === 11 ? 10 : current.flight === 10 ? 1 : current.flight) : 0,
      queued: loss ? 3 : current.packet?.direction === 'right' ? Math.min(3, current.flight) : 0,
      loss, recovering: current.flight === 10 && step > 11 };
  }
  // Each row: sent, confirmed, delivered, held, timer, duplicate ACKs.
  const snapshots = {
    'loss': [
      [0, 0, '', '', 'idle'],
      [1, 0, 'A', '', 'running'],
      [1, 1, 'A', '', 'idle'],
      [2, 1, 'A', '', 'running'],
      [3, 1, 'A', 'C', 'running'],
      [3, 1, 'A', 'C', 'running', 1],
      [3, 1, 'A', 'C', 'expired'],
      [3, 1, 'ABC', '', 'running'],
      [3, 3, 'ABC', '', 'idle']
    ],
    'corrupt': [
      [0, 0, '', '', 'idle'],
      [1, 0, '', '', 'running'],
      [1, 0, '', '', 'running'],
      [1, 0, '', '', 'expired'],
      [1, 0, 'A', '', 'running'],
      [1, 1, 'A', '', 'idle']
    ],
    'ack-loss': [
      [0, 0, '', '', 'idle'],
      [1, 0, 'A', '', 'running'],
      [1, 0, 'A', '', 'running'],
      [1, 0, 'A', '', 'expired'],
      [1, 0, 'A', '', 'running'],
      [1, 1, 'A', '', 'idle']
    ],
    'fast': [
      [0, 0, '', '', 'idle'],
      [1, 0, 'A', '', 'running'],
      [1, 1, 'A', '', 'idle'],
      [2, 1, 'A', '', 'running'],
      [3, 1, 'A', 'C', 'running'],
      [3, 1, 'A', 'C', 'running', 1],
      [4, 1, 'A', 'CD', 'running', 1],
      [4, 1, 'A', 'CD', 'running', 2],
      [5, 1, 'A', 'CDE', 'running', 2],
      [5, 1, 'A', 'CDE', 'running', 3],
      [5, 1, 'ABCDE', '', 'running', 3],
      [5, 5, 'ABCDE', '', 'idle']
    ],
  };
  const snapshot = snapshots[scenario]?.[step];
  if (!snapshot) return null;
  const [sent, confirmed, delivered, held, timer, duplicates = 0] = snapshot;
  return { mode: 'error', sent, confirmed, delivered: [...delivered], held: [...held], timer, duplicates, names: scenario === 'fast' ? ['A','B','C','D','E'] : scenario === 'loss' ? ['A','B','C'] : ['A'], duplicate: scenario === 'ack-loss' && step === 4 };
}

function renderTcpMechanism(scenario, trace, step) {
  const q = id => document.getElementById(id), current = trace[step], state = tcpMechanismState(scenario, trace, step);
  q('mechanism').hidden = !state;
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === tcpScenarioGroup(scenario))));
  if (!state) return;
  const el = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const block = (title, subtitle) => {
    const node = el('div', 'endpoint'); node.append(el('h3', '', title), el('p', 'minor', subtitle)); return node;
  };
  const tokens = items => {
    const row = el('div', 'packet-slots');
    items.forEach(({label, kind}) => row.append(el('span', 'packet-token ' + kind, label)));
    return row;
  };
  function channel(packet, blocked = false) {
    const lane = el('div', 'packet-channel' + (packet?.direction === 'left' ? ' reverse' : ''));
    lane.append(el('span', 'lane-line', packet?.direction === 'left' ? '← ACK' : '데이터 →'));
    if (packet) {
      const failed = ['loss','corrupt'].includes(packet.kind);
      lane.append(el('span', 'moving-packet ' + (failed ? 'failed' : '') + (packet.direction === 'left' ? ' acknowledgement' : ''), packet.label));
      if (failed) lane.append(el('span', 'packet-failure', packet.kind === 'loss' ? '× 유실' : '× 검증 실패 · 폐기'));
    } else lane.append(el('span', 'lane-status', blocked ? '⏸ 새 데이터 전송 중지' : '이 단계는 로컬 상태 변화'));
    return lane;
  }
  const view = q('mechanism-view'); view.replaceChildren();
  q('mechanism-caption').textContent = current.title + ' · ' + current.desc;
  const layout = el('div', 'mechanism-layout');
  if (state.mode === 'error') {
    q('mechanism-heading').textContent = '오류 제어 · 빠진 조각을 복구하기';
    q('mechanism-phase').textContent = state.duplicate ? '중복 제거' : state.timer === 'expired' ? 'RTO 만료' : state.duplicates === 3 ? '빠른 재전송 시작' : 'ACK와 순서 번호';
    const sender = block('송신 TCP', '각 100바이트 · 빗금: 미확인 · 점선: 미전송');
    sender.append(tokens(state.names.map((name, i) => ({ label: name, kind: i < state.confirmed ? 'confirmed' : i < state.sent ? 'unconfirmed' : 'empty' }))));
    const timer = el('div', 'rto-timer ' + state.timer);
    const ring = svgElement('svg', { viewBox: '0 0 72 72', role: 'img', 'aria-label': '재전송 타이머 ' + state.timer });
    ring.append(svgElement('circle', { cx:36,cy:36,r:29,class:'timer-track' }), svgElement('circle', { cx:36,cy:36,r:29,class:'timer-fill' }), svgElement('text', { x:36,y:41,'text-anchor':'middle' }, state.timer === 'expired' ? 'RTO' : state.timer === 'idle' ? '정지' : '대기'));
    timer.append(ring, el('span', '', state.timer === 'expired' ? '시간 만료 → 재전송' : state.timer === 'running' ? '미확인 데이터의 ACK 대기' : '재전송 타이머 정지')); sender.append(timer);
    sender.append(el('p', 'minor', '중복 ACK'), tokens([1,2,3].map(n => ({label: String(n), kind: n <= state.duplicates ? 'confirmed' : 'empty'}))));
    const receiver = block('수신 TCP → 앱', '빈 구간 뒤의 데이터는 버퍼에 보관');
    receiver.append(tokens(state.names.map(name => ({label: name, kind: state.delivered.includes(name) ? 'confirmed' : state.held.includes(name) ? 'held' : 'empty'}))));
    receiver.append(el('p', 'minor', '채움: 앱 전달 · 테두리: 보관 · 점선: 미수신'));
    receiver.append(el('p', 'app-output', '앱: ' + (state.delivered.join('') || '없음')));
    if (state.duplicate) receiver.append(el('div', 'discard-notice', 'A 중복 폐기 ↛ 앱에 다시 전달하지 않음'));
    layout.append(sender, channel(current.packet), receiver);
    q('mechanism-note').textContent = '타이머 원은 정지·대기·만료 상태를 나타내며 실제 RTO 경과율은 아닙니다. 패킷 이동은 현재 단계에서 일어난 일을 재현합니다.';
  } else if (state.mode === 'flow') {
    q('mechanism-heading').textContent = '흐름 제어 · 버퍼가 차면 멈춥니다';
    q('mechanism-phase').textContent = state.blocked ? '송신자가 아는 rwnd = 0' : '새 데이터 전송 가능';
    const sender = block('송신 TCP', '마지막으로 통보받은 rwnd');
    sender.append(tokens([0,1,2,3].map(i => ({label: '100 B',kind: i * 100 < current.rwnd ? 'available' : 'empty'}))));
    sender.append(el('p', 'window-label', 'rwnd ' + current.rwnd + ' B · cwnd 400 B'));
    if (state.blocked) sender.append(el('div','discard-notice','새 데이터 대기 · 전송 여유 0'));
    const receiver = block('수신 버퍼 · 200 B', '한 칸 = 100바이트');
    receiver.append(tokens([0,1].map(i=>({label:state.contents[i] || '빈 칸',kind:state.contents[i] ? 'held' : 'empty'}))));
    receiver.append(el('p', 'read-arrow' + (state.read ? ' reading' : ''), state.read ? '↓ 앱이 읽어 공간을 비움' : '↓ 앱 읽기 대기'));
    receiver.append(tokens(['A','B','C'].map(name=>({label:name,kind:state.delivered.includes(name)?'confirmed':'empty'}))));
    receiver.append(el('p', 'minor', '수신 앱 · ' + (state.delivered.join('') || '아직 읽지 않음')));
    layout.append(sender, channel(current.packet,state.blocked), receiver);
    q('mechanism-note').textContent = '송신 윈도의 네 칸은 고정 cwnd 400바이트 중 rwnd가 허용하는 범위입니다. 버퍼가 비어도 윈도 갱신 ACK가 도착하기 전에는 송신이 재개되지 않습니다.';
  } else {
    q('mechanism-heading').textContent = '혼잡 제어 · 네트워크의 병목';
    q('mechanism-phase').textContent = current.phase;
    const sender = block('송신 TCP', '한 칸 = 1 MSS · cwnd에 따라 전송량 조절');
    sender.append(tokens(Array.from({length:10},(_,i)=>({label:String(i+1),kind:i<current.cwnd?'available':'empty'}))));
    sender.append(el('p','window-label','cwnd ' + current.cwnd + ' MSS'));
    sender.append(el('p','minor','미확인 ' + current.flight + ' MSS · 이번 단계 전송 ' + state.sent + ' MSS'));
    const router = block('라우터 · 병목 구간', '대기열 예시 · 3칸');
    router.append(el('div', 'router-input', state.sent ? '→ ' + state.sent + ' MSS 유입' : state.recovering ? '복구 신호 처리 중' : '이번 라운드 대기열 비움'));
    router.append(tokens([0,1,2].map(i=>({label:i<state.queued?'대기':'빈 칸',kind:i<state.queued?'held':'empty'}))));
    if (state.loss) router.append(el('div','queue-drop','× 초과 패킷 1개 폐기'));
    else router.append(el('p','router-output', state.recovering ? '→ 재전송으로 빈 구간 복구' : '→ 병목 링크를 따라 순차 배출'));
    const receiver = block('수신 TCP', '충분한 수신 공간 · rwnd 20 MSS');
    receiver.append(el('div','receiver-stack', current.flight === 10 ? '□ 누락 1개 + 보관 9개' : current.delivered === '없음' ? '데이터 수신 대기' : '✓ 연속 데이터 수신'));
    receiver.append(el('p','app-output','앱: ' + current.delivered));
    receiver.append(el('p','ack-feedback', current.packet?.direction === 'left' ? '← ' + current.packet.label : state.loss ? '← 중복 ACK 또는 RTO로 감지' : '← ACK 피드백'));
    layout.classList.add('congestion-layout'); layout.append(sender,router,receiver);
    const flight = el('div','flight-ribbon');
    flight.append(el('span','minor','이번 단계의 전송 묶음'));
    flight.append(tokens(Array.from({length:Math.max(1,state.sent)},(_,i)=>({label:state.sent?String(i+1):'전송 없음',kind:state.loss&&i===0?'dropped':state.sent?'available':'empty'}))));
    view.append(flight);
    q('mechanism-note').textContent = '라우터의 3칸은 병목 대기열을 설명하는 개념도입니다. cwnd가 큐 길이를 직접 결정하는 것은 아닙니다. 10 MSS 중 1개가 혼잡으로 버려지는 순간을 보여주며 나머지는 배출되어 수신 버퍼에 보관됩니다. 실제 큐·링크 속도·RTT를 계산한 시뮬레이션은 아닙니다.';
  }
  view.prepend(layout);
}
