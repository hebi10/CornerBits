# CornerBits 그림 자산

2026-10-28 OpenAI 내장 `image_gen.imagegen`으로 생성한 투명 PNG입니다. 원본 생성 파일은 유지하고 프로젝트에는 복사했습니다. SVG나 프로그램으로 그림을 대체하지 않았습니다.

- `mine-atlas.png`: 4×4, 광석 4종/균열 4종, 채굴 터·돌조각·곡괭이·광차·수정·다이아몬드·코인·랜턴.
- `garden-atlas.png`: 4×4, 빈 화분·씨앗·새싹·잎, 성숙 식물군 12종.
- `prompts.json`: 이미지 도구에 전달한 정확한 프롬프트와 생성 옵션. 같은 프롬프트를 PNG 메타데이터에도 기록했습니다.

v0.2.0에서 사용자의 귀여운 장식 요청에 맞춰 `cute-mine-atlas.png`, `cute-garden-atlas.png`, `charms-atlas.png`를 추가했습니다. `cute-prompts.json`에 원본 참조와 정확한 프롬프트를 기록했습니다. 앞의 두 파일은 이전 그림을 참조한 이미지 편집, 전구/보관함/도구 charms는 새 이미지 생성입니다. 이전 그림은 삭제하지 않습니다. 정원에는 배치 간격을 수정한 `cute-garden-spaced.png`를 사용하며, 이미지 편집 도구에 전달한 프롬프트는 `garden-spacing-prompt.txt`에 보존했습니다.

CSS 배경 위치로 각 칸을 표시하며 원본 투명도를 보존합니다. 생성 결과의 미세한 색조도 화면에서는 `grayscale(1)`로 제거합니다. 게임의 모든 광물·품종에 고유한 그림이 있는 것은 아니며, 실제 이름·내구도·남은 시간은 접근성 이름과 툴팁/도감에서 확인합니다.

v0.4.0은 내장 이미지 생성 기능으로 `fishing-atlas.png`와 `sword-atlas.png`를 새로 생성했습니다. `companions-prompts.json`과 PNG 메타데이터에 정확한 프롬프트를 보존했습니다. 낚시0~5는36종을 표현하는6개 물고기군,6~7어항,8낚싯대,9~10찌,11미끼,12낚시터,13보상,14그물,15강화 낚싯대입니다. 검0~9는성장 외형10종,10숫돌,11망치,12조각,13광석주머니,14안정룬,15받침대입니다. 두 atlas는4×4이며 alpha를 유지하고 원본 생성 파일도 남겼습니다.

v0.4.1은 귀여운 얼굴/장난감 느낌을 제거하는 사용자 요청에 따라 `pixel-fishing-atlas.png`, `pixel-sword-atlas.png`, `pixel-garden-atlas.png`, `pixel-utility-atlas.png`를 생성했습니다. 현재 화면은 이 네 자산을 사용하며 모두4×4 프레임 계약과 투명 알파를 유지합니다. 낚시/검의 초기 생성 및 정사각 재배치 편집 프롬프트는 `pixel-main-prompts.json`, 정원/도구의 생성 프롬프트는 `pixel-support-prompts.json`과 각 PNG 메타데이터에 보존했습니다. CSS는 pixelated로 렌더링하며, 어항은 위쪽 이웃 프레임이 비치지 않도록 그림이 없는 상단 여백만 제외합니다. 이전 PNG와 생성 원본은 보존했습니다.

v0.4.2는 `pixel-angler-scenes.png`를 추가해 낚시 메인을 단순한 낚시꾼 장면으로 바꿨습니다.2×2·1254×1254·실제alpha이며 순서는idle/waiting/bite/catch입니다. 인물과 벤치 위치는 CSS의 상태별 정수 offset으로 맞췄습니다. `pixel-angler-prompts.json`과 PNG 메타데이터에 생성/편집 프롬프트를 보존했습니다. 기존낚시atlas는메뉴/도감에서계속사용하며,어항그림은메인에서제외돼기존어항용CSSclip도제거했습니다.
