(() => {
  const protocol = document.body.dataset.protocol;
  const minimal = document.body.classList.contains('minimal-lesson');
  const q = id => document.getElementById(id);
  // Snapshots keep backward navigation and seeking independent of playback history.
  function buildTrace(scenario) {
    let state = { sender: 'ESTABLISHED', receiver: 'ESTABLISHED', delivered: '없음' };
    const steps = [];
    const add = (title, desc, patch = {}, packet = null) => {
      state = { ...state, ...patch };
      steps.push({ title, desc, ...state, packet });
    };
    const right = (label, kind = '') => ({ label, direction: 'right', kind });
    const left = label => ({ label, direction: 'left', kind: 'ack' });
    if (protocol === 'udp') {
      state = { sender: '데이터그램 A·B·C 준비', receiver: '포트에서 수신 대기', delivered: '없음' };
      add('전송 전', 'UDP 연결 수립 절차 없이 목적지 주소와 포트를 지정해 보냅니다.');
      add('A 전송·수신', 'A 한 개를 독립된 메시지로 수신 앱에 전달합니다.', { sender: 'A 전송 시도 완료', receiver: 'A 수신 · ACK 없음', delivered: 'A' }, right('A · 데이터그램'));
      if (scenario === 'reorder') {
        add('B 전송·지연', 'B를 먼저 보냈지만 네트워크에서 지연됩니다. 아직 수신 앱에 도착하지 않았습니다.', { sender: 'B 전송 시도 완료', receiver: 'B 미도착' });
        add('C 먼저 도착', '뒤에 보낸 C가 먼저 도착합니다. UDP는 B를 기다리며 C를 보관하지 않습니다.', { sender: 'C 전송 시도 완료', receiver: 'C 수신 · 재정렬 없음', delivered: 'A | C' }, right('C · 먼저 도착'));
        add('B 늦게 도착', 'B가 도착하면 그대로 전달합니다. 앱에서 관찰한 순서는 A·C·B입니다.', { receiver: 'B 수신', delivered: 'A | C | B' }, right('B · 지연 후 도착'));
      } else {
        const loss = scenario === 'loss';
        add(loss ? 'B 전송·손실' : 'B 전송·수신', loss ? 'B가 경로에서 사라집니다. UDP에는 손실을 알려 줄 ACK나 재전송 타이머가 없습니다.' : 'B는 A와 합쳐지지 않고 별개의 메시지로 전달됩니다.', { sender: 'B 전송 시도 완료', receiver: loss ? 'B 미수신 · 손실 인지 못함' : 'B 수신', delivered: loss ? 'A' : 'A | B' }, right('B · 데이터그램', loss ? 'loss' : ''));
        add('C 전송·수신', loss ? 'B가 없어도 C는 앱에 전달됩니다. 빈자리를 UDP가 복구하지는 않습니다.' : '이 예시에서는 A·B·C 모두 전송 순서대로 도착했습니다. 모든 전송에서 보장되는 것은 아닙니다.', { sender: 'C 전송 시도 완료', receiver: 'C 수신', delivered: loss ? 'A | C' : 'A | B | C' }, right('C · 데이터그램'));
      }
      add('전송 예시 완료', '송신 측은 UDP 자체만으로 수신 결과를 알 수 없습니다. 세로 막대는 보존된 메시지 경계입니다.', { sender: '전송 시도 완료 · 수신 확인 없음' });
    } else if (scenario === 'sequence') {
      state = { ...state, sentBytes: 0, receivedBytes: 0, confirmedBytes: 0, sender: '다음 새 데이터 Seq 101', receiver: '다음에 필요한 바이트 101' };
      add('시작 · 101번부터 보냅니다', '연결은 이미 수립되었습니다. Seq는 바이트 번호입니다. 서로 길이가 다른 A·B·C를 보내며 변화를 비교하세요.');
      let total = 0;
      for (const [name, length] of [['A', 100], ['B', 50], ['C', 150]]) {
        const seq = 101 + total;
        total += length;
        add(name + ' 도착 · ' + seq + '~' + (100 + total), `Seq ${seq}부터 ${length}바이트이므로 마지막 번호는 ${seq} + ${length} − 1 = ${100 + total}입니다. 수신자는 다음 번호 ${101 + total}을 기대하지만 송신자는 아직 ACK를 기다립니다.`, { sentBytes: total, receivedBytes: total, sender: `다음 새 데이터 Seq ${101 + total} · ${name} 확인 대기`, receiver: `다음에 필요한 바이트 ${101 + total}`, delivered: total + '바이트 · 순서대로 전달' }, right(`${name} · SEQ ${seq} · LEN ${length}`));
        add('← ACK ' + (101 + total), `${100 + total}번까지 빠짐없이 받았습니다. ACK = ${seq} + ${length} = ${101 + total}. ACK는 마지막으로 받은 번호보다 1 큽니다. 순수 ACK 자체는 데이터 순서 번호를 소비하지 않습니다.`, { confirmedBytes: total, sender: `ACK ${101 + total} 수신 · ${100 + total}번까지 확인` }, left('ACK ' + (101 + total)));
      }
    } else if (scenario === 'handshake') {
      state = { sender: 'CLOSED', receiver: 'LISTEN', delivered: '없음' };
      add('연결 전', '서버는 연결 요청을 기다립니다. 클라이언트가 연결을 시작합니다.');
      add('SYN →', '클라이언트의 초기 순서 번호는 100입니다. 서버는 SYN을 받고 자신의 번호를 준비합니다.', { sender: 'SYN-SENT', receiver: 'SYN-RECEIVED' }, right('SYN · SEQ 100'));
      add('← SYN + ACK', '서버의 SEQ는 500, ACK는 101입니다. SYN은 순서 번호 하나를 소비합니다.', { sender: 'ESTABLISHED' }, left('SYN + ACK · SEQ 500 · ACK 101'));
      add('ACK →', '클라이언트가 ACK 501로 서버의 SYN을 확인합니다. 서버가 받으면 양쪽 연결 수립이 끝납니다.', { receiver: 'ESTABLISHED' }, right('ACK · SEQ 101 · ACK 501', 'ack'));
      add('데이터 A →', '101번부터 200번까지 100바이트를 전달합니다. TCP가 앱에 제공하는 것은 바이트 스트림입니다.', { delivered: 'A · 100바이트' }, right('DATA A · SEQ 101 · LEN 100'));
      add('← ACK 201', '201번 이전 바이트를 모두 받았다는 누적 확인입니다. ACK만 있는 세그먼트는 순서 번호를 소비하지 않습니다.', {}, left('ACK 201'));
    } else if (scenario === 'loss') {
      add('연결 수립 완료', 'A·B·C는 각 100바이트입니다. 연결은 이미 수립되었고, 수신 측은 101번 바이트를 기다립니다.');
      add('A 도착', '101~200번 바이트가 도착해 앱에 전달됩니다.', { delivered: 'A · 100바이트' }, right('A · SEQ 101 · LEN 100'));
      add('← ACK 201', '다음에 기대하는 바이트는 201번입니다.', {}, left('ACK 201'));
      add('B 손실', '201~300번 바이트가 사라집니다. 송신 측은 아직 손실 여부를 모릅니다.', { sender: 'B 미확인 · 재전송 타이머 동작', receiver: '201번 바이트 대기' }, right('B · SEQ 201 · LEN 100', 'loss'));
      add('C 도착·버퍼 보관', '301~400번 바이트가 먼저 도착합니다. 이 수신자는 C를 보관하며, B 이전에 앱으로 전달하지 않습니다.', { receiver: '201번 대기 · C 버퍼 보관' }, right('C · SEQ 301 · LEN 100'));
      add('← 중복 ACK 201', 'C까지 도착해도 빈 구간이 남아 있어 ACK는 201입니다. 이 예시의 중복 ACK 하나만으로 빠른 재전송을 하지는 않습니다.', {}, left('ACK 201 · 중복'));
      add('재전송 타임아웃', '가장 오래된 미확인 데이터 B의 타이머가 만료됩니다. 실제 시간 간격은 생략했습니다.', { sender: 'B 재전송 준비' });
      add('B 재전송·복구', '같은 순서 번호로 B를 다시 보냅니다. 빈 구간이 채워져 B와 보관한 C를 순서대로 앱에 전달합니다.', { sender: 'ACK 401 대기', receiver: '401번 바이트 대기', delivered: 'ABC · 300바이트' }, right('B 재전송 · SEQ 201 · LEN 100'));
      add('← 누적 ACK 401', '400번까지 연속으로 받았습니다. B와 C를 함께 확인하고 타이머를 멈춥니다.', { sender: '전체 확인 · 타이머 정지' }, left('ACK 401'));
    } else if (scenario === 'corrupt') {
      add('체크섬 검증 전', '수신자는 101번 바이트를 기다립니다. 체크섬은 오류를 검출하며 원래 데이터를 복원하지는 않습니다.');
      add('A 손상·폐기', '전송 중 A의 비트가 바뀌어 체크섬 검증에 실패합니다. 수신 TCP는 세그먼트를 폐기하고 앱에 전달하지 않습니다.', { sender: 'ACK 201 대기 · 타이머 동작', receiver: '손상 세그먼트 폐기 · 101번 대기' }, right('A · 체크섬 오류', 'corrupt'));
      add('ACK 없이 대기', '이 예시에서는 손상 세그먼트에 ACK를 보내지 않습니다. 송신자는 손상인지 손실인지 알 수 없습니다.');
      add('재전송 타임아웃', '미확인 A의 RTO가 만료됩니다. 오류 제어 시간선에서는 혼잡 윈도 변화를 생략합니다.', { sender: 'A 재전송 준비' });
      add('정상 A 재전송', '같은 SEQ 101로 보낸 A가 검증을 통과해 한 번 전달됩니다.', { delivered: 'A · 100바이트', receiver: '201번 바이트 대기' }, right('A 재전송 · SEQ 101'));
      add('← ACK 201', 'A 수신을 확인하고 타이머를 멈춥니다.', { sender: '전체 확인 · 타이머 정지' }, left('ACK 201'));
    } else if (scenario === 'ack-loss') {
      add('A 전송 준비', 'ACK가 사라져도 데이터까지 사라진 것은 아닙니다.');
      add('A 도착·앱 전달', '수신자가 101~200번 바이트를 앱에 전달합니다.', { sender: 'ACK 201 대기', receiver: '201번 바이트 대기', delivered: 'A · 100바이트' }, right('A · SEQ 101'));
      add('ACK 201 손실', '수신자가 보낸 ACK가 경로에서 사라집니다. 송신 측은 여전히 A가 미확인 상태입니다.', {}, { label: 'ACK 201', direction: 'left', kind: 'loss' });
      add('타임아웃', '송신자는 수신 여부를 알 수 없어 A를 다시 보냅니다.', { sender: 'A 재전송 준비' });
      add('중복 A 제거', '이미 받은 101~200번 바이트입니다. 앱에 두 번 전달하지 않고 ACK를 다시 보냅니다.', { receiver: '중복 제거 · 201번 대기' }, right('A 재전송 · SEQ 101'));
      add('← ACK 201 재전송', '송신자가 ACK를 받고 타이머를 멈춥니다. 앱에는 A가 한 번만 전달되었습니다.', { sender: '전체 확인 · 타이머 정지' }, left('ACK 201'));
    } else if (scenario === 'fast') {
      add('연결 수립 완료', 'A~E 각 100바이트를 보낼 충분한 윈도가 있습니다. B 하나가 손실되고 C·D·E는 순서 밖으로 도착합니다.');
      add('A 도착', 'A를 앱에 전달합니다.', { delivered: 'A · 100바이트' }, right('A · SEQ 101'));
      add('← ACK 201', '이 ACK는 새로운 데이터를 확인하는 최초 ACK이며 중복 횟수에 포함하지 않습니다.', { sender: '중복 ACK 0개' }, left('ACK 201 · 최초'));
      add('B 손실', '201~300번 바이트가 빠집니다.', { receiver: '201번 대기' }, right('B · SEQ 201', 'loss'));
      for (const [i, name] of ['C', 'D', 'E'].entries()) {
        add(name + ' 도착·보관', '빈 구간 뒤의 데이터를 버퍼에 보관하고 앱에는 아직 전달하지 않습니다.', { receiver: 'B 대기 · ' + ['C', 'CD', 'CDE'][i] + ' 보관' }, right(name + ' · SEQ ' + (301 + i * 100)));
        add('중복 ACK ' + (i + 1) + '개', '누적 ACK가 201에 머뭅니다.' + (i === 2 ? ' 세 번째 중복 ACK로 타임아웃 전에 빠른 재전송을 시작합니다.' : ''), { sender: '중복 ACK ' + (i + 1) + '개' }, left('ACK 201 · 중복 ' + (i + 1)));
      }
      add('B 빠른 재전송', '빠진 B가 도착해 B~E가 연속으로 이어집니다. 순서대로 앱에 전달합니다.', { sender: 'ACK 601 대기', receiver: '601번 대기', delivered: 'ABCDE · 500바이트' }, right('B 재전송 · SEQ 201'));
      add('← ACK 601', 'E까지 누적 확인합니다. 혼잡 윈도 감소와 빠른 회복은 Reno 시나리오에서 따로 확인합니다.', { sender: '전체 확인' }, left('ACK 601'));
    } else if (scenario === 'flow') {
      state = { ...state, rwnd: 200, cwnd: 400, flight: 0, buffer: 0, phase: '수신 공간 확인', unit: '바이트' };
      add('빈 수신 버퍼', '앱은 아직 데이터를 읽지 않습니다. 수신 버퍼는 200바이트이며 송신자는 광고된 rwnd 200을 알고 있습니다.');
      add('A 수신·버퍼 100', 'A는 수신 TCP 버퍼에 도착했지만 앱이 읽지 않았습니다. 송신자는 ACK 전이므로 기존 rwnd를 알고 있습니다.', { flight: 100, buffer: 100, sender: 'A 100바이트 미확인', receiver: 'A 보관 · 여유 100바이트' }, right('A · SEQ 101 · LEN 100'));
      add('← ACK 201 · rwnd 100', 'A가 확인되고 남은 수신 공간 100바이트가 송신자에게 알려집니다.', { rwnd: 100, flight: 0 }, left('ACK 201 · rwnd 100'));
      add('B 수신·버퍼 가득', 'B 100바이트로 버퍼가 찹니다. A와 B는 아직 앱에 전달되지 않았습니다.', { flight: 100, buffer: 200, sender: 'B 100바이트 미확인', receiver: 'AB 보관 · 여유 0바이트' }, right('B · SEQ 201 · LEN 100'));
      add('← ACK 301 · rwnd 0', '수신자가 더 받을 공간이 없다고 알립니다. 확인은 완료됐어도 새 데이터 C는 보낼 수 없습니다.', { rwnd: 0, flight: 0, phase: 'Zero Window' }, left('ACK 301 · rwnd 0'));
      add('C 전송 대기', 'cwnd가 커도 rwnd가 0이면 새 데이터 전송 여유는 0입니다. 실제 TCP는 윈도 재개를 확인하는 probe를 사용할 수 있습니다.', { sender: 'C 전송 중지 · 윈도 갱신 대기' });
      add('앱이 A 읽음', '앱이 A를 읽어 버퍼 100바이트가 비었습니다. 송신자는 아직 갱신 ACK를 받지 못해 rwnd 0으로 판단합니다.', { buffer: 100, delivered: 'A · 100바이트', receiver: 'B 보관 · 여유 100바이트' });
      add('← 윈도 갱신 · rwnd 100', '새 데이터를 받지 않아 ACK는 301 그대로지만 rwnd가 바뀝니다. 같은 ACK 번호라고 모두 손실 신호인 것은 아닙니다.', { rwnd: 100, phase: '전송 재개', sender: 'C 전송 가능' }, left('ACK 301 · rwnd 100'));
      add('C 수신', '열린 공간으로 C 100바이트를 보냅니다. 수신 버퍼에는 B와 C가 있습니다.', { buffer: 200, flight: 100, receiver: 'BC 보관 · 여유 0바이트' }, right('C · SEQ 301 · LEN 100'));
      add('← ACK 401 · rwnd 0', 'C를 확인하고 다시 버퍼가 가득 찼음을 알립니다.', { rwnd: 0, flight: 0, sender: '전체 데이터 확인' }, left('ACK 401 · rwnd 0'));
      add('앱이 B·C 읽음', '앱이 나머지 데이터를 읽어 버퍼를 모두 비웁니다.', { buffer: 0, delivered: 'ABC · 300바이트', receiver: '빈 버퍼' });
      add('← rwnd 200', '수신자가 다시 200바이트를 받을 수 있음을 알립니다.', { rwnd: 200, phase: '수신 공간 확보' }, left('ACK 401 · rwnd 200'));
    } else if (scenario === 'congestion' || scenario === 'congestion-timeout') {
      state = { ...state, rwnd: 20, cwnd: 1, flight: 0, threshold: 8, phase: 'Slow Start', unit: 'MSS' };
      add('Slow Start 시작', 'Reno 교육 모형입니다. 초기 cwnd 1 MSS, ssthresh 8 MSS입니다. 수신 윈도 20 MSS는 충분히 크다고 가정합니다.');
      let total = 0;
      for (const window of [1, 2, 4, 8, 9]) {
        add(window + ' MSS 전송', 'cwnd만큼 보내고 이 라운드의 ACK를 기다립니다. 한 줄은 여러 세그먼트를 묶은 것입니다.', { flight: window, sender: window + ' MSS 미확인' }, right('DATA · ' + window + ' MSS'));
        total += window;
        const next = window < 8 ? window * 2 : window + 1;
        add('ACK 후 cwnd ' + next, window < 8 ? '각 세그먼트에 ACK가 와서 RTT마다 대략 두 배로 증가합니다.' + (next === 8 ? ' 임계값에 도달해 다음 라운드는 혼잡 회피로 진행합니다.' : '') : 'Congestion Avoidance에서는 한 RTT에 대략 1 MSS씩 증가합니다. 이 값은 ACK 처리를 라운드로 묶은 근사입니다.', { cwnd: next, flight: 0, phase: next >= 8 ? 'Congestion Avoidance' : 'Slow Start', delivered: total + ' MSS · 순서대로 전달', sender: '라운드 전체 확인' }, left('누적 ACK · cwnd ' + next));
      }
      add('10 MSS 전송·일부 손실', '10 MSS 중 첫 세그먼트가 손실되고 나머지는 수신 버퍼에 보관됩니다. 새 누적 ACK가 없어 FlightSize는 10 MSS입니다.', { flight: 10, sender: '10 MSS 미확인', receiver: '빈 구간 뒤의 데이터 보관' }, right('10 MSS 중 손실', 'loss'));
      if (scenario === 'congestion-timeout') {
        add('RTO · cwnd 1', '이 분기에서는 중복 ACK도 유실되어 RTO가 먼저 만료됩니다. ssthresh = max(FlightSize / 2, 2 MSS) = 5 MSS, cwnd = 1 MSS로 줄입니다.', { cwnd: 1, threshold: 5, phase: 'Slow Start · RTO', sender: '가장 오래된 미확인 세그먼트 재전송' });
        add('손실 세그먼트 재전송', '재전송은 새 바이트를 추가하지 않아 FlightSize를 더 늘리지 않습니다. 미확인 데이터가 새 cwnd보다 많아도 이미 보낸 데이터를 취소하지 않습니다.', {}, right('손실 세그먼트 재전송'));
        add('복구 ACK · cwnd 2', '이 예시에서는 재전송 한 개로 빈 구간이 채워집니다. 전체 10 MSS를 확인하는 ACK 하나를 받고 Slow Start에서 cwnd를 1 MSS 늘립니다.', { flight: 0, cwnd: 2, delivered: '34 MSS · 순서대로 전달', sender: '복구 완료 · Slow Start', receiver: '연속 데이터 수신 완료' }, left('복구 누적 ACK'));
      } else {
        for (let duplicate = 1; duplicate <= 3; duplicate++) add('중복 ACK ' + duplicate + '개', duplicate < 3 ? '같은 누적 ACK가 반복됩니다. 이 모형은 Limited Transmit을 생략합니다.' : '세 번째 중복 ACK에서 ssthresh = max(10 / 2, 2) = 5 MSS, cwnd = ssthresh + 3 = 8 MSS로 설정합니다. 타임아웃 없이 빠른 재전송·회복에 들어갑니다.', { ...(duplicate === 3 ? { cwnd: 8, threshold: 5, phase: 'Fast Recovery' } : {}), sender: '중복 ACK ' + duplicate + '개' }, left('중복 ACK · ' + duplicate));
        add('빠른 재전송', '빠진 세그먼트를 재전송합니다. 3 MSS의 일시적 윈도 증가는 중복 ACK가 알린 네트워크 이탈을 반영합니다.', { sender: '복구 누적 ACK 대기' }, right('손실 세그먼트 재전송'));
        add('복구 ACK · cwnd 5', '빈 구간이 채워져 전체 10 MSS가 확인됩니다. Reno는 cwnd를 ssthresh인 5 MSS로 낮추고 혼잡 회피로 돌아갑니다.', { flight: 0, cwnd: 5, phase: 'Congestion Avoidance', delivered: '34 MSS · 순서대로 전달', sender: '복구 완료', receiver: '연속 데이터 수신 완료' }, left('복구 누적 ACK'));
        add('5 MSS 전송', '감소한 cwnd만큼 다음 데이터를 보냅니다.', { flight: 5 }, right('DATA · 5 MSS'));
        add('다음 RTT · cwnd 6', 'ACK가 정상적으로 돌아오면 다시 RTT당 대략 1 MSS씩 증가합니다.', { flight: 0, cwnd: 6, delivered: '39 MSS · 순서대로 전달' }, left('누적 ACK · cwnd 6'));
      }
    } else {
      add('연결 종료 전', '이 예시에서는 클라이언트가 먼저 송신을 닫고, 서버가 나중에 닫습니다. 미전송 데이터는 없습니다.');
      add('FIN →', '클라이언트는 더 보낼 데이터가 없음을 알립니다. 서버는 FIN을 받아도 남은 데이터를 보낼 수 있습니다.', { sender: 'FIN-WAIT-1', receiver: 'CLOSE-WAIT' }, right('FIN · SEQ 101 · ACK 501'));
      add('← ACK', '서버가 클라이언트의 FIN을 확인합니다. FIN도 순서 번호 하나를 소비합니다.', { sender: 'FIN-WAIT-2' }, left('ACK · SEQ 501 · ACK 102'));
      add('← FIN', '서버 앱도 송신을 닫습니다. 클라이언트는 서버 FIN을 받고 TIME-WAIT로 들어갑니다.', { sender: 'TIME-WAIT', receiver: 'LAST-ACK' }, left('FIN + ACK · SEQ 501 · ACK 102'));
      add('마지막 ACK →', '서버는 마지막 ACK를 받고 닫힙니다. 클라이언트는 서버 FIN 재전송에 다시 응답할 수 있도록 기다립니다.', { receiver: 'CLOSED' }, right('ACK · SEQ 102 · ACK 502', 'ack'));
      add('2MSL 대기 후 종료', '최대 세그먼트 수명의 두 배를 기다린 뒤 클라이언트도 닫힙니다. 실제 대기 시간은 구현에 따라 다릅니다.', { sender: 'CLOSED' });
    }
    return steps;
  }
  let step = 0, timer = null, trace;
  function pause() {
    clearInterval(timer);
    timer = null;
    q('play').textContent = minimal ? '재생' : '자동 재생';
    q('play').setAttribute('aria-pressed', 'false');
  }
  function draw() {
    const svg = q('trace'), width = 560, row = 66, height = 80 + (trace.length - 1) * row;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren(svgElement('title', { id: 'trace-title' }, protocol.toUpperCase() + ' 전송 시간선'), svgElement('desc', { id: 'trace-desc' }, trace[step].title + '. ' + trace[step].desc));
    const defs = svgElement('defs'), marker = svgElement('marker', { id: 'arrow', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 5, markerHeight: 5, orient: 'auto' });
    marker.append(svgElement('path', { d: 'M0 0 L8 4 L0 8 Z', fill: 'var(--color-brand)' }));
    defs.append(marker); svg.append(defs);
    for (const [x, label] of [[44, '송신 측'], [516, '수신 측']]) {
      svg.append(svgElement('text', { x, y: 22, 'text-anchor': 'middle' }, label), svgElement('line', { x1: x, x2: x, y1: 36, y2: height - 12, class: 'rail' }));
    }
    trace.slice(1).forEach((event, i) => {
      const y = 52 + i * row, packet = event.packet;
      const group = svgElement('g', { class: i + 1 > step ? 'future' : '' });
      if (i + 1 === step) group.append(svgElement('rect', { x: 16, y: y - 20, width: 528, height: 62, rx: 8, class: 'highlight' }));
      if (packet) {
        const forward = packet.direction === 'right', lost = packet.kind === 'loss';
        const x1 = forward ? 44 : 516, x2 = lost ? 280 : forward ? 516 : 44;
        group.append(svgElement('line', { x1, x2, y1: y, y2: y + 30, class: 'packet ' + packet.kind, ...(!lost ? { 'marker-end': 'url(#arrow)' } : {}) }), svgElement('text', { x: 280, y: y - 6, 'text-anchor': 'middle' }, packet.label));
        if (packet.kind === 'corrupt') group.append(svgElement('text', { x: 470, y: y + 49 }, '× 손상'));
        if (lost) group.append(svgElement('text', { x: x2, y: y + 44, 'text-anchor': 'middle' }, '× 손실'));
      } else group.append(svgElement('text', { x: 280, y: y + 12, 'text-anchor': 'middle' }, event.title));
      svg.append(group);
    });
  }
  function renderControl(current) {
    if (protocol !== 'tcp') return;
    const scenario = q('scenario').value;
    const lessons = {
      flow: '흐름 제어는 수신자의 버퍼를 보호합니다. 실제 버퍼 사용량과 송신자가 마지막 ACK로 알고 있는 rwnd를 비교하세요.',
      congestion: '혼잡 제어는 네트워크 부하를 조절합니다. Reno의 cwnd·ssthresh가 손실 신호에 어떻게 반응하는지 확인하세요.',
      loss: '오류 제어는 손상·손실·중복에 대응합니다. 재전송 시점과 수신 앱에 전달되는 데이터를 비교하세요.'
    };
    q('lesson').textContent = (scenario === 'sequence' ? '다음 →를 눌러 데이터 도착과 ACK 도착을 비교하세요. A는 100, B는 50, C는 150바이트입니다.' : lessons[tcpScenarioGroup(scenario)]) || '연결을 열고 닫을 때 양쪽 TCP 상태와 순서 번호가 어떻게 바뀌는지 확인하세요.';
    const visible = current.cwnd !== undefined;
    q('control-state').hidden = !visible;
    if (!visible) return;
    const flow = scenario === 'flow', unit = current.unit;
    q('control-heading').textContent = flow ? '흐름 제어 · 수신 공간과 전송 여유' : '혼잡 제어 · Reno의 윈도 변화';
    q('control-note').textContent = flow ? 'rwnd는 송신자가 마지막으로 통보받은 값입니다. 수신 버퍼가 비어도 윈도 갱신 전에는 송신자가 알 수 없습니다.' : '1 MSS는 세그먼트 하나의 최대 데이터 크기입니다. 아래 값은 MSS 단위로 정규화했습니다. 손실 복구 중에는 별도 규칙이 적용됩니다.';
    const metrics = [['rwnd · 광고된 수신 윈도', current.rwnd], ['cwnd · 혼잡 윈도', current.cwnd], ['FlightSize · 미확인 데이터', current.flight]];
    if (current.threshold !== undefined) metrics.push(['ssthresh · Slow Start 임계값', current.threshold]);
    q('metrics').replaceChildren(...metrics.map(([label, value]) => {
      const box = document.createElement('div'), term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label; definition.textContent = value + ' ' + unit;
      box.append(term, definition); return box;
    }));
    const available = Math.max(0, Math.min(current.rwnd, current.cwnd) - current.flight);
    q('window-rule').textContent = `${current.phase} · 새 데이터 전송 여유: max(0, min(${current.rwnd}, ${current.cwnd}) − ${current.flight}) = ${available} ${unit}`;
    q('buffer-state').hidden = !flow; q('cwnd-state').hidden = flow;
    if (flow) {
      q('buffer-meter').value = current.buffer;
      q('buffer-caption').textContent = `사용 ${current.buffer} / 200바이트 · 실제 빈 공간 ${200 - current.buffer}바이트 · 앱 전달: ${current.delivered}`;
    } else {
      const svg = q('cwnd-chart'), history = trace.slice(0, step + 1);
      const x = index => 40 + index * 480 / (trace.length - 1), y = value => 176 - value * 14;
      svg.setAttribute('viewBox', '0 0 560 220');
      svg.replaceChildren(svgElement('title', {}, 'Reno 혼잡 윈도 변화'), svgElement('desc', {}, `현재 cwnd ${current.cwnd} MSS, ssthresh ${current.threshold} MSS, ${current.phase}`));
      for (const tick of [0, 5, 10]) svg.append(svgElement('line', { x1: 40, x2: 520, y1: y(tick), y2: y(tick), class: 'chart-grid' }), svgElement('text', { x: 30, y: y(tick) + 5, 'text-anchor': 'end' }, tick));
      svg.append(svgElement('line', { x1: 40, x2: 520, y1: y(current.threshold), y2: y(current.threshold), class: 'chart-threshold' }), svgElement('text', { x: 520, y: y(current.threshold) - 6, 'text-anchor': 'end' }, 'ssthresh ' + current.threshold));
      svg.append(svgElement('polyline', { points: history.map((event, index) => `${x(index)},${y(event.cwnd)}`).join(' '), class: 'chart-line' }));
      history.forEach((event, index) => {
        const point = svgElement('circle', { cx: x(index), cy: y(event.cwnd), r: index === step ? 5 : 3, class: 'chart-point' });
        point.append(svgElement('title', {}, `${event.title}: ${event.cwnd} MSS`)); svg.append(point);
      });
      svg.append(svgElement('text', { x: 40, y: 207 }, '시작'), svgElement('text', { x: 520, y: 207, 'text-anchor': 'end' }, `${step + 1} / ${trace.length}단계`));
    }
  }
  function render() {
    const current = trace[step];
    renderControl(current);
    if (protocol === 'tcp') renderTcpMechanism(q('scenario').value, trace, step);
    for (const [id, key] of [['current-title','title'], ['description','desc'], ['sender','sender'], ['receiver','receiver'], ['delivered','delivered']]) q(id).textContent = current[key];
    q('count').textContent = `${step + 1} / ${trace.length}`;
    q('progress').max = trace.length - 1;
    q('progress').value = step;
    q('prev').disabled = step === 0;
    q('next').disabled = step === trace.length - 1;
    q('steps').querySelectorAll('li').forEach((item, i) => {
      if (i === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    draw();
  }
  function goTo(value) {
    pause(); step = Math.max(0, Math.min(trace.length - 1, value)); render();
  }
  function selectScenario(value) {
    q('scenario').value = value; trace = buildTrace(value);
    if (q('trace-details')) q('trace-details').open = ['handshake', 'close'].includes(value);
    q('steps').innerHTML = trace.map((event, i) => `<li><button type="button" data-step="${i}">${event.title}</button></li>`).join('');
    goTo(0);
  }
  q('scenario').addEventListener('change', () => selectScenario(q('scenario').value));
  q('reset').addEventListener('click', () => goTo(0));
  q('prev').addEventListener('click', () => goTo(step - 1));
  q('next').addEventListener('click', () => goTo(step + 1));
  q('progress').addEventListener('input', event => goTo(Number(event.target.value)));
  q('steps').addEventListener('click', event => {
    const button = event.target.closest('[data-step]');
    if (button) goTo(Number(button.dataset.step));
  });
  q('play').addEventListener('click', () => {
    if (timer) { pause(); return; }
    if (step === trace.length - 1) step = 0;
    q('play').textContent = minimal ? '정지' : '일시 정지'; q('play').setAttribute('aria-pressed', 'true'); render();
    timer = setInterval(() => { step++; if (step === trace.length - 1) pause(); render(); }, 1400);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  selectScenario(q('scenario').value);
})();
