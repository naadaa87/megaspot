/* 입점 호스트 플랫폼 기준값 — 입점 기준 · 공간 유형 · 지역 · 시설 · 본사 부가서비스 · 이용료 플랜
   서버 사본: functions/api/_hostplat.js 의 PLATFORM (두 곳이 같아야 합니다 · tests/hostplat.test.mjs 가 확인) */
window.MEGASPOT_PLATFORM = {
  "tiers": [
    {
      "id": "mega",
      "label": "초대형 공간",
      "people": 100,
      "pyeong": 100
    },
    {
      "id": "large",
      "label": "대형 공간",
      "people": 50,
      "pyeong": 50
    }
  ],
  "maxTypes": 5,
  "typeGroups": [
    {
      "id": "meeting",
      "label": "모임공간",
      "types": [
        [
          "partyroom",
          "파티룸"
        ],
        [
          "seminar",
          "세미나/워크숍"
        ],
        [
          "conference",
          "컨퍼런스"
        ],
        [
          "banquet",
          "연회장"
        ]
      ]
    },
    {
      "id": "event",
      "label": "행사공간",
      "types": [
        [
          "wedding",
          "스몰웨딩"
        ],
        [
          "popup",
          "팝업스토어"
        ],
        [
          "concert",
          "공연장"
        ],
        [
          "theater",
          "극장"
        ],
        [
          "expo",
          "박람회장"
        ]
      ]
    },
    {
      "id": "store",
      "label": "매장공간",
      "types": [
        [
          "cafe",
          "카페"
        ],
        [
          "restaurant",
          "음식점"
        ],
        [
          "bar",
          "주류바"
        ],
        [
          "shop",
          "일반매장"
        ]
      ]
    },
    {
      "id": "shoot",
      "label": "촬영공간",
      "types": [
        [
          "studio",
          "스튜디오"
        ],
        [
          "gallery",
          "갤러리"
        ],
        [
          "broadcast",
          "방송촬영"
        ]
      ]
    },
    {
      "id": "etc",
      "label": "기타공간",
      "types": [
        [
          "practice",
          "연습실"
        ],
        [
          "sports_in",
          "체육시설(실내)"
        ],
        [
          "sports_out",
          "체육시설(실외)"
        ],
        [
          "camp_in",
          "캠핑장(실내)"
        ],
        [
          "camp_out",
          "캠핑장(실외)"
        ],
        [
          "hall",
          "다목적홀"
        ]
      ]
    }
  ],
  "regions": [
    [
      "seoul",
      "서울"
    ],
    [
      "incheon",
      "인천"
    ],
    [
      "gyeonggi",
      "경기"
    ],
    [
      "etc",
      "그 외 지역"
    ]
  ],
  "facilities": [
    [
      "projector",
      "빔프로젝터·대형 화면"
    ],
    [
      "sound",
      "음향·스피커"
    ],
    [
      "mic",
      "마이크"
    ],
    [
      "wifi",
      "와이파이"
    ],
    [
      "stage",
      "무대·단상"
    ],
    [
      "lighting",
      "조명"
    ],
    [
      "tables",
      "테이블·의자 제공"
    ],
    [
      "kitchen",
      "주방·싱크대"
    ],
    [
      "fridge",
      "냉장고"
    ],
    [
      "aircon",
      "냉난방"
    ],
    [
      "elevator",
      "엘리베이터"
    ],
    [
      "parking",
      "주차 가능"
    ],
    [
      "restroom",
      "내부 화장실"
    ],
    [
      "waiting",
      "대기실·준비실"
    ],
    [
      "outdoor",
      "야외·테라스"
    ],
    [
      "loading",
      "화물 반입 동선"
    ],
    [
      "accessible",
      "휠체어 접근"
    ],
    [
      "pet",
      "반려동물 동반"
    ]
  ],
  "purposes": [
    [
      "seminar",
      "세미나·강연"
    ],
    [
      "workshop",
      "워크숍·팀빌딩"
    ],
    [
      "conference",
      "컨퍼런스·포럼"
    ],
    [
      "networking",
      "네트워킹·리셉션"
    ],
    [
      "party",
      "송년회·단체 파티"
    ],
    [
      "wedding",
      "스몰웨딩·기념행사"
    ],
    [
      "popup",
      "팝업·전시·마켓"
    ],
    [
      "show",
      "공연·상영"
    ],
    [
      "shoot",
      "촬영"
    ],
    [
      "class",
      "클래스·교육"
    ],
    [
      "sports",
      "체육·레크리에이션"
    ],
    [
      "etc",
      "기타"
    ]
  ],
  "addons": [
    {
      "id": "buffet",
      "label": "출장뷔페",
      "desc": "인원에 맞춘 뷔페 코스를 행사장에 차려 드립니다.",
      "link": "/catering/"
    },
    {
      "id": "catering",
      "label": "케이터링",
      "desc": "다과·핑거푸드·도시락처럼 가볍게 준비하는 식음료.",
      "link": "/reception/"
    },
    {
      "id": "cocktail",
      "label": "출장 칵테일",
      "desc": "바텐더가 현장에서 칵테일 바를 운영합니다.",
      "link": "/cocktail/"
    },
    {
      "id": "mc",
      "label": "사회자·강연자 섭외",
      "desc": "행사 성격에 맞는 사회자·강연자를 찾아 연결합니다.",
      "link": ""
    },
    {
      "id": "manager",
      "label": "현장 매니저",
      "desc": "행사 당일 진행·동선·장비를 현장에서 챙깁니다.",
      "link": ""
    },
    {
      "id": "design",
      "label": "디자인·제작물",
      "desc": "현수막·X배너·리플렛 등 행사 제작물을 만듭니다.",
      "link": ""
    }
  ],
  "freeMonths": 2,
  "fee": {
    "per": "space",
    "vat": "excluded",
    "vatRate": 10,
    "refundRate": 50
  },
  "plans": [
    {
      "id": "m12",
      "months": 12,
      "monthly": 100000,
      "daily": 3300
    },
    {
      "id": "m6",
      "months": 6,
      "monthly": 150000,
      "daily": 5000
    },
    {
      "id": "m3",
      "months": 3,
      "monthly": 200000,
      "daily": 6600
    },
    {
      "id": "m1",
      "months": 1,
      "monthly": 250000,
      "daily": 8300
    }
  ],
  "priceModes": [
    [
      "hourly",
      "시간 대관"
    ],
    [
      "package",
      "패키지"
    ],
    [
      "daily",
      "하루 대관"
    ],
    [
      "quote",
      "견적 문의"
    ]
  ],
  "optionUnits": [
    "건",
    "시간",
    "인",
    "개",
    "일"
  ],
  "payMethods": [
    [
      "bank",
      "계좌이체"
    ],
    [
      "card_link",
      "카드·간편결제 링크"
    ],
    [
      "onsite",
      "현장 결제"
    ]
  ],
  "refundPresets": [
    [
      "standard",
      "표준 (이용 15일 전 100% · 8~14일 전 80% · 4~7일 전 50% · 3일 전~당일 환불 불가)"
    ],
    [
      "flexible",
      "유연 (이용 7일 전 100% · 3~6일 전 50% · 2일 전~당일 환불 불가)"
    ],
    [
      "custom",
      "직접 입력"
    ]
  ]
};
