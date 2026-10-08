// 메가스팟 건대 · 평면 기하 데이터 (단위 m, 3D 뷰어와 같은 좌표계: x 오른쪽, z 아래쪽)
// 실측 손도면(2026-10-06) + 수정 치수(하단 세로 7,770mm) 기준. 외곽 사선 각도·기둥 단면·가구 위치에는 추정이 포함됩니다.
(function(){
  var De = Math.sqrt(16.45*16.45 - 4*4);   // 메인 홀 세로(사선 16,450의 수직 성분) ≈ 15.956
  var xe = De + 7.77;                      // 주출입구 기준선
  var bi = xe + 5.06;                      // 하단 날개 끝
  window.MEGASPOT_GUNDAE_PLAN = {
    De:De, xe:xe, bi:bi, width:25.33, height:4.3,
    boundary: [[4,0],[16,0],[16,3.47],[25.33,3.47],[25.33,bi],[19.33,bi],[19.33,xe],[16.5,xe],[16.5,De],[0,De]],
    windows: [ [[4,0],[16,0]], [[0,De],[4,0]] ],
    columns: [ {id:'C1',x:2,z:7.178,w:.6,d:1.6}, {id:'C2',x:5.98,z:7.728,w:1.07,d:.5}, {id:'C3',x:10.18,z:7.728,w:.45,d:.5}, {id:'C4',x:16.1,z:7.678,w:.6,d:.6} ],
    fixtures: [
      {id:'screenwall', zone:'screen',  type:'wall',  x:16.045, z:8.923, w:.15, d:(De-1)-8.923, label:'' },
      {id:'screen',    zone:'screen',  type:'screen',x:15.93,  z:9.586, w:.08, d:4.428, label:'200" SCREEN' },
      {id:'booth',     zone:'booth',   type:'box',   x:16.065, z:4.55,  w:.79, d:2.48,  label:'진행부스' },
      {id:'sink',      zone:'service', type:'box',   x:16.2,   z:9.28,  w:.96, d:2.74,  label:'싱크' },
      {id:'fridge1',   zone:'service', type:'box',   x:16.25,  z:12.66, w:.84, d:.82,   label:'냉장고' },
      {id:'fridge2',   zone:'service', type:'box',   x:16.25,  z:13.65, w:.84, d:.82,   label:'' },
      {id:'storage',   zone:'storage', type:'room',  x:20.6,   z:xe-4.9-1.19, w:4.73, d:1.19, label:'창고' },
      {id:'door',      zone:'entrance',type:'door',  x:16.75,  z:xe,    w:1.9,  d:0,    label:'주출입구' },
      {id:'bench',     zone:'lounge',  type:'bench', x:1.1,    z:De-.87, w:14.4, d:.76,  label:'벽면 벤치' },
      {id:'bench2',    zone:'lounge',  type:'bench', x:24.35,  z:19.44, w:.77,  d:4,    label:'' },
      {id:'brick',     zone:'hall',    type:'brick', x:7.1,    z:7.83,  w:2.4,  d:.17,  label:'벽돌 장식벽' },
      {id:'brick2',    zone:'lounge',  type:'brick', x:19.5,   z:bi-.2, w:5.7,  d:.2,   label:'' },
      {id:'chandelier',zone:'hall',    type:'light', x:8.3,    z:8.0,   r:.5,  label:'샹들리에' }
    ],
    furniture: {
      tables: [
        // 메인 홀 긴 테이블 (3.35 × 0.78)
        {x:6.65,z:10,w:3.35,d:.78,chairs:true},{x:6.65,z:12.3,w:3.35,d:.78,chairs:true},{x:6.65,z:14.4,w:3.35,d:.78,chairs:true},
        {x:10.12,z:10,w:3.35,d:.78,chairs:true},{x:10.12,z:12.3,w:3.35,d:.78,chairs:true},{x:10.12,z:14.4,w:3.35,d:.78,chairs:true},
        // 상부 소형 테이블 (2.55 × 0.75)
        {x:8,z:3,w:2.55,d:.75,chairs:true},{x:8,z:5.2,w:2.55,d:.75,chairs:true},{x:11.7,z:3,w:2.55,d:.75,chairs:true},{x:11.7,z:5.2,w:2.55,d:.75,chairs:true},
        // 창가 바 테이블 (1.55 × 0.58)
        {x:5.3,z:1.03,w:1.55,d:.58,bar:true},{x:8.2,z:1.03,w:1.55,d:.58,bar:true},{x:11.1,z:1.03,w:1.55,d:.58,bar:true},{x:14,z:1.03,w:1.55,d:.58,bar:true},
        // 안쪽 라운지 테이블
        {x:22.3,z:20.35,w:1.65,d:.78,chairs:true},{x:22.3,z:22.18,w:1.65,d:.78,chairs:true},{x:22.5,z:25.15,w:1.8,d:.79,chairs:true},{x:22.5,z:27.05,w:1.8,d:.79,chairs:true}
      ],
      plants: [[6.73,8.47],[10.94,8.28],[20.14,22.34],[14.83,2.63]]
    },
    dims: [
      {a:[4,0],b:[16,0],off:-0.9,text:'12.00'},
      {a:[0,De],b:[16.5,De],off:0.9,text:'16.50'},
      {a:[16.5,De],b:[16.5,xe],off:-0.9,text:'7.77', vertical:true},
      {a:[16,0],b:[16,3.47],off:0.9,text:'3.47*', vertical:true},
      {a:[2.6,7.73],b:[16.1,7.73],off:-0.7,text:'13.50† (기둥 열)'},
      {a:[19.33,bi],b:[25.33,bi],off:0.9,text:'6.00'},
      {a:[25.33,xe],b:[25.33,bi],off:0.9,text:'5.06', vertical:true},
      {a:[16.5,xe-4.9],b:[25.33,xe-4.9],off:0.6,text:'8.83'},
      {a:[20.6,xe-4.9-1.19],b:[25.33,xe-4.9-1.19],off:-0.6,text:'4.73 × 1.19 (창고)'}
    ],
    pins: [
      {id:'hall',x:8.5,z:11.2},{id:'screen',x:14.9,z:11.8},{id:'booth',x:16.46,z:5.79},{id:'service',x:17.6,z:11.4},
      {id:'storage',x:22.97,z:xe-4.9-.6},{id:'entrance',x:17.7,z:xe-.9},{id:'windows',x:5.2,z:2.2},{id:'lounge',x:22.3,z:24.3}
    ],
    labels: [
      {x:2.9,z:12.3,text:'메인 홀'},{x:13.3,z:2.45,text:'창가 좌석'},{x:22.3,z:23.6,text:'라운지'},{x:18.4,z:14.9,text:'준비 공간'},{x:21,z:10.5,text:'안쪽 통로'}
    ]
  };
})();
