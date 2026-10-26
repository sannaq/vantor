/* 0단계 왕초보 — 알파벳·파닉스·기초 단어·생존 표현 */
(function () {
  function L(up, name, sound, word, wordKo, wordPron) {
    return { up: up, low: up.toLowerCase(), name: name, sound: sound, word: word, wordKo: wordKo, wordPron: wordPron };
  }
  // "영어|발음|뜻" 문자열을 객체로
  function W(list) {
    return list.map(function (s) { var p = s.split("|"); return { w: p[0], pron: p[1], ko: p[2] }; });
  }
  function Q(q, choices, answer, explain) { return { q: q, choices: choices, answer: answer, explain: explain }; }

  var alphabet = [
    L("A", "에이", "애 / 에이", "apple", "사과", "애플"),
    L("B", "비", "ㅂ", "ball", "공", "볼"),
    L("C", "씨", "ㅋ / ㅆ", "cat", "고양이", "캣"),
    L("D", "디", "ㄷ", "dog", "개", "독"),
    L("E", "이", "에 / 이", "egg", "달걀", "에그"),
    L("F", "에프", "ㅍ (윗니로 아랫입술을 살짝 물고)", "fish", "물고기", "피시"),
    L("G", "쥐", "ㄱ / ㅈ", "girl", "소녀", "걸"),
    L("H", "에이치", "ㅎ", "hat", "모자", "햇"),
    L("I", "아이", "이 / 아이", "ink", "잉크", "잉크"),
    L("J", "제이", "ㅈ", "juice", "주스", "주스"),
    L("K", "케이", "ㅋ", "king", "왕", "킹"),
    L("L", "엘", "ㄹ (혀끝을 윗니 뒤에 붙이고)", "lion", "사자", "라이언"),
    L("M", "엠", "ㅁ", "milk", "우유", "밀크"),
    L("N", "엔", "ㄴ", "nose", "코", "노우즈"),
    L("O", "오우", "아 / 오우", "octopus", "문어", "악토퍼스"),
    L("P", "피", "ㅍ", "pig", "돼지", "피그"),
    L("Q", "큐", "ㅋ (보통 qu = 크우)", "queen", "여왕", "퀸"),
    L("R", "아알", "ㄹ (혀를 안쪽으로 말아서)", "red", "빨간색", "레드"),
    L("S", "에스", "ㅅ / ㅆ", "sun", "해", "선"),
    L("T", "티", "ㅌ", "tiger", "호랑이", "타이거"),
    L("U", "유", "어 / 유", "umbrella", "우산", "엄브렐라"),
    L("V", "브이", "ㅂ (윗니로 아랫입술을 살짝 물고)", "violin", "바이올린", "바이올린"),
    L("W", "더블유", "우 (입술을 동그랗게 내밀고)", "water", "물", "워터"),
    L("X", "엑스", "ㅋㅅ", "box", "상자", "박스"),
    L("Y", "와이", "이 (짧게) / 아이", "yellow", "노란색", "옐로우"),
    L("Z", "지", "ㅈ (벌이 날 때 '즈~' 떨리는 소리)", "zoo", "동물원", "주")
  ];

  var phonics = [
    {
      no: 1, title: "짧은 모음 a·e·i·o·u",
      body: "<p>영어 글자 26개 중 <b>a, e, i, o, u</b> 다섯 개를 <b>모음</b>이라고 해요. 한글의 ㅏ·ㅔ·ㅣ 같은 역할이에요.</p><p>짧은 단어 가운데에 모음이 하나 있으면 대부분 <b>짧은 소리</b>가 나요.</p><table><tr><th>글자</th><th>짧은 소리</th><th>예</th></tr><tr><td>a</td><td>애</td><td>cat 캣</td></tr><tr><td>e</td><td>에</td><td>bed 베드</td></tr><tr><td>i</td><td>이</td><td>pig 피그</td></tr><tr><td>o</td><td>아</td><td>hot 핫</td></tr><tr><td>u</td><td>어</td><td>cup 컵</td></tr></table><p>팁: <b>자음+모음+자음</b> 세 글자 단어는 글자 소리를 그대로 이어 읽으면 돼요. c-a-t → 크-애-트 → <b>캣</b>.</p>",
      words: W(["cat|캣|고양이", "map|맵|지도", "bed|베드|침대", "pen|펜|펜", "pig|피그|돼지", "sit|싯|앉다", "hot|핫|뜨거운", "dog|독|개", "cup|컵|컵", "bus|버스|버스"]),
      quiz: [
        Q("cat 의 a 소리는?", ["애", "에이", "아"], 0, "짧은 단어 가운데 a 는 짧게 '애' 소리가 나요. 캣."),
        Q("bed 의 e 소리는?", ["이", "에", "어"], 1, "짧은 e 는 '에' 소리예요. 베드."),
        Q("pig 의 i 소리는?", ["아이", "애", "이"], 2, "짧은 i 는 '이' 소리예요. 피그."),
        Q("hot 의 o 소리는?", ["아", "오우", "우"], 0, "짧은 o 는 입을 크게 벌린 '아' 소리예요. 핫."),
        Q("cup 의 u 소리는?", ["유", "어", "우"], 1, "짧은 u 는 '어' 소리예요. 컵."),
        Q("'개'를 뜻하는 단어는?", ["dog", "dig", "dug"], 0, "d-o-g → 독. 개라는 뜻이에요.")
      ]
    },
    {
      no: 2, title: "자음 소리 b·c·d·f·g·h",
      body: "<p>모음이 아닌 글자를 <b>자음</b>이라고 해요. 이름(비, 씨, 디…)과 실제 소리는 달라요. 단어 속에서는 <b>소리</b>로 읽어요.</p><ul><li><b>b</b> = ㅂ (bag 백)</li><li><b>c</b> = 주로 ㅋ (cap 캡), e·i 앞에서는 ㅆ (city 시티)</li><li><b>d</b> = ㄷ (desk 데스크)</li><li><b>f</b> = ㅍ, 단 윗니로 아랫입술을 살짝 물고 바람을 내보내요 (fan 팬)</li><li><b>g</b> = 주로 ㄱ (gum 검)</li><li><b>h</b> = ㅎ (hat 햇)</li></ul><p>팁: f 는 한국어 ㅍ 보다 <b>바람 소리</b>가 나요. 입술을 붙이지 마세요.</p>",
      words: W(["bag|백|가방", "bat|뱃|방망이", "cap|캡|모자", "city|시티|도시", "desk|데스크|책상", "fan|팬|선풍기", "fun|펀|재미", "gum|검|껌", "get|겟|얻다", "hat|햇|모자", "hen|헨|암탉"]),
      quiz: [
        Q("bag 의 첫 소리는?", ["ㅂ", "ㅍ", "ㄷ"], 0, "b 는 ㅂ 소리예요. 백."),
        Q("cap 의 c 소리는?", ["ㅆ", "ㅋ", "ㅊ"], 1, "c 는 a·o·u 앞에서 ㅋ 소리예요. 캡."),
        Q("city 의 c 소리는?", ["ㅋ", "ㄱ", "ㅆ"], 2, "c 가 i·e 앞에 오면 ㅆ 소리가 나요. 시티."),
        Q("f 를 발음하는 방법은?", ["윗니로 아랫입술을 살짝 물고", "두 입술을 꼭 붙이고", "혀를 말아서"], 0, "f 는 윗니를 아랫입술에 대고 바람을 내보내요."),
        Q("hat 의 뜻은?", ["모자", "고양이", "뜨거운"], 0, "hat 햇 = 모자. hot 핫 = 뜨거운과 헷갈리지 마세요."),
        Q("desk 의 뜻은?", ["의자", "책상", "가방"], 1, "desk 데스크 = 책상.")
      ]
    },
    {
      no: 3, title: "자음 소리 j·k·l·m·n·p",
      body: "<ul><li><b>j</b> = ㅈ (jam 잼)</li><li><b>k</b> = ㅋ (kid 키드)</li><li><b>l</b> = ㄹ, 혀끝을 윗니 뒤에 붙여요 (leg 레그)</li><li><b>m</b> = ㅁ (man 맨)</li><li><b>n</b> = ㄴ (net 넷)</li><li><b>p</b> = ㅍ, 두 입술을 붙였다가 터뜨려요 (pan 팬)</li></ul><p>팁: <b>p</b> 와 <b>f</b> 는 한글로 둘 다 ㅍ 이지만 달라요. p 는 입술끼리, f 는 이와 입술로 소리 내요.</p>",
      words: W(["jam|잼|잼", "job|잡|직업", "kid|키드|아이", "kit|킷|도구 세트", "leg|레그|다리", "lip|립|입술", "man|맨|남자", "mom|맘|엄마", "net|넷|그물", "nut|넛|견과", "pan|팬|프라이팬", "pot|팟|냄비"]),
      quiz: [
        Q("jam 의 첫 소리는?", ["ㅈ", "ㅊ", "ㅎ"], 0, "j 는 ㅈ 소리예요. 잼."),
        Q("kid 의 뜻은?", ["아이", "열쇠", "왕"], 0, "kid 키드 = 아이."),
        Q("l 소리를 낼 때 혀는?", ["윗니 뒤에 붙인다", "안쪽으로 만다", "이 사이로 내민다"], 0, "l 은 혀끝을 윗니 뒤 잇몸에 붙여요."),
        Q("man 의 a 소리는?", ["에이", "애", "아"], 1, "짧은 a = 애. 맨."),
        Q("p 와 f 의 차이는?", ["p 는 두 입술, f 는 윗니+아랫입술", "둘 다 똑같다", "p 는 혀, f 는 목"], 0, "p 는 입술끼리 터뜨리고 f 는 이로 입술을 살짝 물어요."),
        Q("'냄비'는?", ["pot", "pet", "pit"], 0, "pot 팟 = 냄비. 짧은 o 는 '아'.")
      ]
    },
    {
      no: 4, title: "자음 소리 q·r·s·t·v·w·x·y·z",
      body: "<ul><li><b>qu</b> = 크우 (queen 퀸). q 는 거의 항상 u 와 붙어 다녀요.</li><li><b>r</b> = ㄹ, 혀를 안쪽으로 말고 어디에도 닿지 않게 (run 런)</li><li><b>s</b> = ㅅ/ㅆ (sun 선)</li><li><b>t</b> = ㅌ (top 탑)</li><li><b>v</b> = ㅂ, 윗니로 아랫입술을 물고 떨어요 (van 밴)</li><li><b>w</b> = 우, 입술을 동그랗게 (wet 웻)</li><li><b>x</b> = ㅋㅅ (box 박스)</li><li><b>y</b> = 단어 첫머리에서 '이' 짧게 (yes 예스)</li><li><b>z</b> = ㅈ, 벌 소리처럼 떨어요 (zip 집)</li></ul>",
      words: W(["quiz|퀴즈|퀴즈", "run|런|달리다", "red|레드|빨간", "sun|선|해", "top|탑|꼭대기", "van|밴|승합차", "wet|웻|젖은", "box|박스|상자", "six|식스|6", "yes|예스|네", "zip|집|지퍼", "zoo|주|동물원"]),
      quiz: [
        Q("q 는 보통 어떤 글자와 붙어 다닐까요?", ["u", "a", "e"], 0, "q 는 거의 항상 qu 로 써요. queen, quiz."),
        Q("r 소리를 낼 때 혀는?", ["안쪽으로 말아 어디에도 안 닿게", "윗니 뒤에 붙인다", "이 사이로 내민다"], 0, "r 은 혀를 말아요. l 과 다른 점이에요."),
        Q("box 의 x 소리는?", ["ㅋㅅ", "ㅈ", "ㅎ"], 0, "x 는 ㅋㅅ 소리예요. 박스."),
        Q("van 의 v 소리는?", ["ㅂ (윗니로 아랫입술)", "ㅍ (두 입술)", "우"], 0, "v 는 f 처럼 윗니를 입술에 대고 목을 울려요."),
        Q("yes 의 뜻은?", ["아니요", "네", "어제"], 1, "yes 예스 = 네."),
        Q("'동물원'은?", ["zoo", "sue", "two"], 0, "zoo 주 = 동물원. z 는 떨리는 ㅈ.")
      ]
    },
    {
      no: 5, title: "매직 e — 긴 모음 a_e · i_e · o_e · u_e",
      body: "<p>단어 끝에 <b>e</b> 가 붙으면 그 e 는 <b>소리가 안 나요</b>. 대신 앞의 모음이 <b>자기 이름</b>대로 길게 소리 나요. 이걸 <b>매직 e</b> 라고 불러요.</p><table><tr><th>모양</th><th>소리</th><th>예</th></tr><tr><td>a_e</td><td>에이</td><td>cap 캡 → cape 케이프</td></tr><tr><td>i_e</td><td>아이</td><td>kit 킷 → kite 카이트</td></tr><tr><td>o_e</td><td>오우</td><td>hop 합 → hope 호우프</td></tr><tr><td>u_e</td><td>유 / 우</td><td>cub 컵 → cube 큐브</td></tr></table><p>팁: 끝에 e 가 보이면 \"앞 모음은 이름대로!\" 라고 기억하세요.</p>",
      words: W(["cake|케이크|케이크", "name|네임|이름", "make|메이크|만들다", "bike|바이크|자전거", "time|타임|시간", "kite|카이트|연", "home|호움|집", "nose|노우즈|코", "hope|호우프|희망", "cute|큐트|귀여운", "cube|큐브|정육면체"]),
      quiz: [
        Q("cake 끝의 e 는?", ["소리가 안 난다", "'이' 소리가 난다", "'에' 소리가 난다"], 0, "매직 e 는 소리가 없고 앞 모음을 길게 만들어요."),
        Q("cake 의 a 소리는?", ["애", "에이", "아"], 1, "a_e 는 a 이름대로 '에이'. 케이크."),
        Q("bike 의 i 소리는?", ["이", "아이", "에"], 1, "i_e 는 '아이'. 바이크."),
        Q("home 의 o 소리는?", ["오우", "아", "어"], 0, "o_e 는 '오우'. 호움."),
        Q("kit 에 e 를 붙인 kite 의 발음은?", ["킷", "카이트", "키테"], 1, "e 가 붙으면 i 가 '아이'로 바뀌어요."),
        Q("cute 의 뜻은?", ["귀여운", "자르다", "컵"], 0, "cute 큐트 = 귀여운. u_e 는 '유'.")
      ]
    },
    {
      no: 6, title: "모음 두 개 — ai · ay · ee · ea · oa",
      body: "<p>모음 두 개가 나란히 있으면 보통 <b>첫 번째 모음이 자기 이름</b>으로 소리 나고 두 번째는 조용해요.</p><table><tr><th>글자</th><th>소리</th><th>예</th></tr><tr><td>ai</td><td>에이</td><td>rain 레인</td></tr><tr><td>ay</td><td>에이 (단어 끝)</td><td>day 데이</td></tr><tr><td>ee</td><td>이~ (길게)</td><td>tree 트리</td></tr><tr><td>ea</td><td>이~ (길게)</td><td>tea 티</td></tr><tr><td>oa</td><td>오우</td><td>boat 보우트</td></tr></table><p>팁: ai 는 단어 가운데, ay 는 단어 끝에 주로 와요.</p>",
      words: W(["rain|레인|비", "mail|메일|우편", "day|데이|날", "play|플레이|놀다", "tree|트리|나무", "feet|피트|발들", "tea|티|차", "eat|잇|먹다", "boat|보우트|배", "road|로우드|길", "soap|소우프|비누"]),
      quiz: [
        Q("rain 의 ai 소리는?", ["애이", "에이", "아이"], 1, "ai 는 a 이름대로 '에이'. 레인."),
        Q("day 의 ay 소리는?", ["에이", "아이", "애"], 0, "단어 끝 ay 도 '에이'. 데이."),
        Q("tree 의 ee 소리는?", ["에", "이~", "에에"], 1, "ee 는 길게 '이~'. 트리."),
        Q("tea 의 ea 소리는?", ["이~", "에아", "애"], 0, "ea 도 보통 길게 '이~'. 티."),
        Q("boat 의 oa 소리는?", ["오아", "오우", "아"], 1, "oa 는 '오우'. 보우트."),
        Q("'비누'는?", ["soap", "soup", "sip"], 0, "soap 소우프 = 비누. soup 수프는 국물.")
      ]
    },
    {
      no: 7, title: "두 글자가 한 소리 — sh · ch · th · wh · ph",
      body: "<p>자음 두 개가 만나 <b>새로운 소리 하나</b>가 되는 경우예요.</p><ul><li><b>sh</b> = 쉬 (ship 쉽)</li><li><b>ch</b> = 치 (chair 체어)</li><li><b>th</b> = 혀끝을 윗니와 아랫니 사이에 살짝 내밀고 바람 — 한글로는 ㅆ/ㄷ 비슷 (think 씽크, this 디스)</li><li><b>wh</b> = 우 (what 왓)</li><li><b>ph</b> = f 와 같은 소리 ㅍ (phone 폰)</li></ul><p>팁: th 는 한국어에 없는 소리예요. <b>혀를 살짝 깨문다</b>고 생각하세요.</p>",
      words: W(["ship|쉽|배", "fish|피시|물고기", "shop|샵|가게", "chair|체어|의자", "lunch|런치|점심", "think|씽크|생각하다", "this|디스|이것", "what|왓|무엇", "when|웬|언제", "phone|폰|전화", "photo|포우토우|사진"]),
      quiz: [
        Q("ship 의 sh 소리는?", ["ㅅ", "쉬", "치"], 1, "sh 는 '쉬'. 쉽."),
        Q("chair 의 ch 소리는?", ["치", "키", "쉬"], 0, "ch 는 '치'. 체어."),
        Q("th 를 발음할 때 혀는?", ["윗니와 아랫니 사이로 살짝", "입천장에 붙인다", "안쪽으로 만다"], 0, "th 는 혀끝을 이 사이로 살짝 내밀어요."),
        Q("phone 의 ph 소리는?", ["ㅍ (f 소리)", "ㅎ", "ㅂ"], 0, "ph 는 f 와 같은 소리예요. 폰."),
        Q("what 의 뜻은?", ["언제", "무엇", "어디"], 1, "what 왓 = 무엇. when 웬 = 언제."),
        Q("'점심'은?", ["lunch", "launch", "lung"], 0, "lunch 런치 = 점심. 끝의 ch = 치.")
      ]
    },
    {
      no: 8, title: "자음 두 개 섞기 — bl · cl · st · tr · gr …",
      body: "<p>자음 두 개가 붙어 있지만 <b>두 소리를 빠르게 이어</b> 내는 경우예요. 한글로 쓰면 사이에 '으'가 들어가지만, 실제로는 <b>'으'를 아주 약하게</b> 붙여 말해요.</p><table><tr><th>섞기</th><th>예</th></tr><tr><td>bl</td><td>blue 블루</td></tr><tr><td>cl</td><td>clock 클락</td></tr><tr><td>fl</td><td>flag 플래그</td></tr><tr><td>st</td><td>stop 스탑</td></tr><tr><td>tr</td><td>tree 트리</td></tr><tr><td>gr</td><td>green 그린</td></tr><tr><td>sn</td><td>snow 스노우</td></tr></table><p>팁: '스-탑' 처럼 끊지 말고 <b>'스탑'</b> 한 박자로.</p>",
      words: W(["blue|블루|파란", "black|블랙|검은", "clock|클락|시계", "class|클래스|수업", "flag|플래그|깃발", "stop|스탑|멈추다", "star|스타|별", "train|트레인|기차", "truck|트럭|트럭", "green|그린|초록", "grass|그래스|잔디", "snow|스노우|눈"]),
      quiz: [
        Q("stop 을 자연스럽게 읽으면?", ["스탑 (한 박자)", "스-으-탑 (세 박자)", "탑"], 0, "섞기 자음은 '으'를 거의 안 들리게 한 박자로 이어요."),
        Q("blue 의 첫 두 글자는?", ["bl", "br", "pl"], 0, "b+l 섞기. 블루."),
        Q("clock 의 뜻은?", ["시계", "구름", "수업"], 0, "clock 클락 = 시계."),
        Q("train 의 tr 소리는?", ["트르", "츠", "드"], 0, "t+r 을 빠르게 이어 '트ㄹ'. 트레인."),
        Q("green 의 뜻은?", ["회색", "초록", "잔디"], 1, "green 그린 = 초록. grass 그래스 = 잔디."),
        Q("'별'은?", ["star", "stair", "stay"], 0, "star 스타 = 별.")
      ]
    },
    {
      no: 9, title: "r 이 붙은 모음 — ar · er · ir · or · ur",
      body: "<p>모음 뒤에 <b>r</b> 이 오면 모음 소리가 바뀌어요. 혀를 안쪽으로 말아 <b>'ㄹ' 울림</b>을 끝에 붙여요.</p><table><tr><th>글자</th><th>소리</th><th>예</th></tr><tr><td>ar</td><td>아ㄹ</td><td>car 카</td></tr><tr><td>or</td><td>오ㄹ</td><td>fork 포크</td></tr><tr><td>er</td><td>어ㄹ</td><td>her 허</td></tr><tr><td>ir</td><td>어ㄹ</td><td>bird 버드</td></tr><tr><td>ur</td><td>어ㄹ</td><td>nurse 너스</td></tr></table><p>팁: <b>er · ir · ur 은 모두 같은 '어ㄹ'</b> 소리예요. 철자만 달라요.</p>",
      words: W(["car|카|자동차", "park|파크|공원", "star|스타|별", "fork|포크|포크", "corn|콘|옥수수", "her|허|그녀를", "water|워터|물", "bird|버드|새", "girl|걸|소녀", "nurse|너스|간호사", "turn|턴|돌다"]),
      quiz: [
        Q("car 의 ar 소리는?", ["아ㄹ", "애", "에어"], 0, "ar 은 '아' 뒤에 혀를 마는 소리. 카."),
        Q("fork 의 or 소리는?", ["오ㄹ", "어ㄹ", "아ㄹ"], 0, "or 은 '오ㄹ'. 포크."),
        Q("er · ir · ur 의 소리는?", ["모두 '어ㄹ'로 같다", "모두 다르다", "모두 '이'"], 0, "철자는 달라도 소리는 같은 '어ㄹ'이에요."),
        Q("bird 의 뜻은?", ["새", "침대", "빵"], 0, "bird 버드 = 새."),
        Q("nurse 의 뜻은?", ["의사", "간호사", "선생님"], 1, "nurse 너스 = 간호사."),
        Q("'공원'은?", ["park", "pork", "perk"], 0, "park 파크 = 공원. pork 포크는 돼지고기.")
      ]
    },
    {
      no: 10, title: "oo · ou · ow · oi · oy",
      body: "<ul><li><b>oo</b> = 긴 '우~' (moon 문) 또는 짧은 '우' (book 북)</li><li><b>ou</b> = 아우 (house 하우스)</li><li><b>ow</b> = 아우 (cow 카우) 또는 오우 (snow 스노우)</li><li><b>oi</b> = 오이 (coin 코인)</li><li><b>oy</b> = 오이, 단어 끝에 (boy 보이)</li></ul><p>팁: ou 와 ow 는 둘 다 '아우'가 기본. oi 는 가운데, oy 는 끝에 와요.</p>",
      words: W(["moon|문|달", "food|푸드|음식", "book|북|책", "look|룩|보다", "house|하우스|집", "mouth|마우쓰|입", "cow|카우|소", "down|다운|아래로", "coin|코인|동전", "oil|오일|기름", "boy|보이|소년", "toy|토이|장난감"]),
      quiz: [
        Q("moon 의 oo 소리는?", ["우~ (길게)", "오오", "아"], 0, "oo 는 '우~'. 문."),
        Q("house 의 ou 소리는?", ["오우", "아우", "우"], 1, "ou 는 '아우'. 하우스."),
        Q("cow 의 ow 소리는?", ["아우", "오우", "오"], 0, "cow 의 ow 는 '아우'. 카우."),
        Q("coin 의 oi 소리는?", ["오이", "오아", "아이"], 0, "oi 는 '오이'. 코인."),
        Q("boy 의 뜻은?", ["소년", "소녀", "장난감"], 0, "boy 보이 = 소년. toy 토이 = 장난감."),
        Q("'책'은?", ["book", "boot", "boat"], 0, "book 북 = 책. 짧은 oo.")
      ]
    },
    {
      no: 11, title: "소리 안 나는 글자 — kn · wr · mb · gh",
      body: "<p>영어에는 <b>써 있지만 읽지 않는 글자</b>가 있어요. 옛날 발음이 남아 있는 거예요.</p><table><tr><th>모양</th><th>안 읽는 글자</th><th>예</th></tr><tr><td>kn</td><td>k</td><td>know 노우</td></tr><tr><td>wr</td><td>w</td><td>write 라이트</td></tr><tr><td>mb</td><td>b (끝에서)</td><td>climb 클라임</td></tr><tr><td>gh</td><td>gh</td><td>night 나잇</td></tr></table><p>팁: <b>knife</b> 를 '크나이프'로 읽지 말고 <b>'나이프'</b>로.</p>",
      words: W(["know|노우|알다", "knife|나이프|칼", "knee|니|무릎", "write|라이트|쓰다", "wrong|롱|틀린", "climb|클라임|오르다", "lamb|램|어린 양", "night|나잇|밤", "light|라잇|빛", "high|하이|높은"]),
      quiz: [
        Q("know 에서 안 읽는 글자는?", ["k", "n", "w"], 0, "kn 의 k 는 소리가 없어요. 노우."),
        Q("write 에서 안 읽는 글자는?", ["w", "r", "t"], 0, "wr 의 w 는 소리가 없어요. 라이트."),
        Q("climb 의 발음은?", ["클라임", "클라임브", "클림"], 0, "끝의 mb 에서 b 는 읽지 않아요."),
        Q("night 의 발음은?", ["나잇", "니그트", "나이그"], 0, "gh 는 소리가 없어요. 나잇."),
        Q("knife 의 뜻은?", ["무릎", "칼", "알다"], 1, "knife 나이프 = 칼."),
        Q("'틀린'은?", ["wrong", "long", "strong"], 0, "wrong 롱 = 틀린. w 는 소리 없음.")
      ]
    },
    {
      no: 12, title: "강세와 리듬 · 자주 쓰는 사이트 워드",
      body: "<p><b>강세</b> = 단어에서 <b>세게·길게</b> 말하는 부분이에요. 영어는 강세를 틀리면 잘 못 알아들어요.</p><ul><li>BA-na-na → ba-<b>NA</b>-na (버<b>내</b>너)</li><li><b>CO</b>-ffee (<b>커</b>피), ho-<b>TEL</b> (호<b>텔</b>)</li></ul><p>문장에서도 중요한 단어(명사·동사)는 세게, the·a·is 같은 작은 단어는 약하게 말해요.</p><p><b>사이트 워드</b> = 파닉스 규칙대로 안 읽히지만 너무 자주 나와서 <b>통째로 외우는</b> 단어예요.</p><table><tr><th>단어</th><th>발음</th><th>뜻</th></tr><tr><td>the</td><td>더</td><td>그</td></tr><tr><td>is</td><td>이즈</td><td>~이다</td></tr><tr><td>you</td><td>유</td><td>너, 당신</td></tr><tr><td>are</td><td>아</td><td>~이다</td></tr><tr><td>was</td><td>워즈</td><td>~였다</td></tr><tr><td>said</td><td>세드</td><td>말했다</td></tr></table>",
      words: W(["the|더|그", "a|어|하나의", "is|이즈|~이다", "are|아|~이다", "you|유|너, 당신", "I|아이|나", "was|워즈|~였다", "said|세드|말했다", "do|두|하다", "of|어브|~의", "to|투|~에게, ~로", "they|데이|그들"]),
      quiz: [
        Q("강세란?", ["단어에서 세게·길게 말하는 부분", "소리 안 나는 글자", "단어 끝의 e"], 0, "강세가 있는 부분을 세고 길게 말해요."),
        Q("banana 의 강세는?", ["ba", "na (가운데)", "na (끝)"], 1, "ba-NA-na, 버내너. 가운데를 세게."),
        Q("문장에서 약하게 말하는 단어는?", ["the, a, is 같은 작은 단어", "명사", "동사"], 0, "중요한 단어는 세게, 작은 기능어는 약하게."),
        Q("said 의 발음은?", ["세드", "세이드", "사이드"], 0, "said 는 규칙과 달리 '세드'. 통째로 외워요."),
        Q("you 의 뜻은?", ["나", "너, 당신", "그들"], 1, "you 유 = 너, 당신."),
        Q("the 의 발음은?", ["더", "테", "티"], 0, "the 는 th 소리로 '더'.")
      ]
    }
  ];

  function cat(name, list) { return W(list).map(function (o) { o.cat = name; return o; }); }

  var words = [].concat(
    cat("인사", ["hello|헬로우|안녕", "hi|하이|안녕 (가볍게)", "bye|바이|잘 가", "goodbye|굿바이|안녕히 가세요", "yes|예스|네", "no|노우|아니요", "please|플리즈|부탁해요", "thanks|땡스|고마워", "sorry|쏘리|미안해요", "okay|오케이|좋아요", "welcome|웰컴|환영해요", "excuse|익스큐즈|실례하다 (excuse me)", "name|네임|이름", "nice|나이스|좋은, 반가운", "meet|밋|만나다", "friend|프렌드|친구", "sir|써|선생님 (남성 존칭)", "ma'am|맴|부인 (여성 존칭)", "see|씨|보다", "fine|파인|괜찮은"]),
    cat("숫자", ["zero|지로우|0", "one|원|1", "two|투|2", "three|쓰리|3", "four|포|4", "five|파이브|5", "six|식스|6", "seven|세븐|7", "eight|에잇|8", "nine|나인|9", "ten|텐|10", "eleven|일레븐|11", "twelve|트웰브|12", "twenty|트웬티|20", "thirty|써티|30", "fifty|피프티|50", "hundred|헌드레드|100", "thousand|싸우전드|1000", "first|퍼스트|첫 번째", "second|세컨드|두 번째"]),
    cat("요일·달", ["Monday|먼데이|월요일", "Tuesday|튜즈데이|화요일", "Wednesday|웬즈데이|수요일", "Thursday|써즈데이|목요일", "Friday|프라이데이|금요일", "Saturday|새터데이|토요일", "Sunday|선데이|일요일", "January|재뉴어리|1월", "February|페브루어리|2월", "March|마치|3월", "April|에이프릴|4월", "May|메이|5월", "June|준|6월", "July|줄라이|7월", "August|어거스트|8월", "September|셉템버|9월", "October|악토버|10월", "November|노벰버|11월", "December|디셈버|12월", "week|위크|주, 일주일"]),
    cat("시간", ["time|타임|시간", "hour|아워|1시간", "minute|미닛|분", "morning|모닝|아침", "afternoon|애프터눈|오후", "evening|이브닝|저녁", "night|나잇|밤", "today|투데이|오늘", "tomorrow|투마로우|내일", "yesterday|예스터데이|어제", "now|나우|지금", "later|레이터|나중에", "day|데이|날, 하루", "month|먼쓰|달, 월", "year|이어|해, 년", "early|얼리|이른", "late|레잇|늦은", "noon|눈|정오", "weekend|위켄드|주말", "o'clock|어클락|~시 정각"]),
    cat("가족", ["family|패밀리|가족", "father|파더|아버지", "mother|마더|어머니", "dad|대드|아빠", "mom|맘|엄마", "brother|브라더|형제", "sister|시스터|자매", "son|선|아들", "daughter|도터|딸", "baby|베이비|아기", "husband|허즈번드|남편", "wife|와이프|아내", "grandfather|그랜드파더|할아버지", "grandmother|그랜드마더|할머니", "uncle|엉클|삼촌", "aunt|앤트|이모, 고모", "cousin|커즌|사촌", "parents|페어런츠|부모님", "child|차일드|아이", "kids|키즈|아이들"]),
    cat("몸", ["head|헤드|머리", "face|페이스|얼굴", "eye|아이|눈", "ear|이어|귀", "nose|노우즈|코", "mouth|마우쓰|입", "tooth|투쓰|이, 치아", "hair|헤어|머리카락", "neck|넥|목", "shoulder|숄더|어깨", "arm|암|팔", "hand|핸드|손", "finger|핑거|손가락", "leg|레그|다리", "foot|풋|발", "knee|니|무릎", "back|백|등", "stomach|스터먹|배, 위", "heart|하트|심장", "body|바디|몸"]),
    cat("음식", ["food|푸드|음식", "water|워터|물", "rice|라이스|쌀, 밥", "bread|브레드|빵", "egg|에그|달걀", "milk|밀크|우유", "coffee|커피|커피", "tea|티|차", "apple|애플|사과", "banana|버내너|바나나", "meat|미트|고기", "chicken|치킨|닭고기", "fish|피시|생선", "soup|수프|국, 수프", "noodle|누들|국수", "juice|주스|주스", "sugar|슈거|설탕", "salt|솔트|소금", "lunch|런치|점심", "dinner|디너|저녁 식사"]),
    cat("색깔", ["red|레드|빨간색", "blue|블루|파란색", "yellow|옐로우|노란색", "green|그린|초록색", "black|블랙|검은색", "white|와이트|흰색", "brown|브라운|갈색", "pink|핑크|분홍색", "orange|오린지|주황색", "purple|퍼플|보라색", "gray|그레이|회색", "gold|골드|금색", "silver|실버|은색", "color|컬러|색깔", "dark|다크|어두운", "light|라잇|밝은, 연한", "navy|네이비|남색", "beige|베이지|베이지색", "violet|바이올렛|보라색 (연한)", "khaki|캐키|카키색"]),
    cat("장소", ["home|호움|집", "house|하우스|주택", "school|스쿨|학교", "office|오피스|사무실", "hospital|하스피털|병원", "bank|뱅크|은행", "store|스토어|가게", "shop|샵|상점", "market|마켓|시장", "restaurant|레스토랑|식당", "cafe|캐페이|카페", "park|파크|공원", "hotel|호텔|호텔", "airport|에어포트|공항", "station|스테이션|역", "church|처치|교회", "library|라이브러리|도서관", "room|룸|방", "toilet|토일렛|화장실", "city|시티|도시"]),
    cat("직업", ["teacher|티처|선생님", "student|스튜던트|학생", "doctor|닥터|의사", "nurse|너스|간호사", "chef|셰프|요리사", "driver|드라이버|운전기사", "police|폴리스|경찰", "farmer|파머|농부", "worker|워커|노동자, 직원", "singer|싱어|가수", "artist|아티스트|예술가", "writer|라이터|작가", "engineer|엔지니어|기술자", "designer|디자이너|디자이너", "lawyer|로이어|변호사", "pilot|파일럿|조종사", "clerk|클럭|점원, 사무원", "manager|매니저|관리자", "boss|보스|상사", "dentist|덴티스트|치과의사"]),
    cat("사무실", ["desk|데스크|책상", "chair|체어|의자", "computer|컴퓨터|컴퓨터", "phone|폰|전화", "paper|페이퍼|종이", "pen|펜|펜", "pencil|펜슬|연필", "book|북|책", "file|파일|파일, 서류철", "email|이메일|이메일", "meeting|미팅|회의", "work|워크|일", "job|잡|직업, 일자리", "company|컴퍼니|회사", "report|리포트|보고서", "copy|카피|복사(본)", "printer|프린터|프린터", "team|팀|팀", "schedule|스케줄|일정", "document|다큐먼트|문서"]),
    cat("동사 기본", ["go|고우|가다", "come|컴|오다", "eat|잇|먹다", "drink|드링크|마시다", "sleep|슬립|자다", "read|리드|읽다", "write|라이트|쓰다", "run|런|달리다", "walk|워크|걷다", "sit|싯|앉다", "stand|스탠드|서다", "open|오픈|열다", "close|클로우즈|닫다", "buy|바이|사다", "give|기브|주다", "take|테이크|가져가다", "have|해브|가지다", "like|라이크|좋아하다", "want|원트|원하다", "know|노우|알다"]),
    cat("형용사 기본", ["big|빅|큰", "small|스몰|작은", "good|굿|좋은", "bad|배드|나쁜", "hot|핫|뜨거운, 더운", "cold|콜드|차가운, 추운", "new|뉴|새로운", "old|올드|오래된, 나이 든", "happy|해피|행복한", "sad|새드|슬픈", "fast|패스트|빠른", "slow|슬로우|느린", "long|롱|긴", "short|숏|짧은", "easy|이지|쉬운", "hard|하드|어려운, 단단한", "busy|비지|바쁜", "tired|타이어드|피곤한", "clean|클린|깨끗한", "pretty|프리티|예쁜"]),
    cat("날씨", ["weather|웨더|날씨", "sun|선|해", "sunny|써니|화창한", "rain|레인|비", "rainy|레이니|비 오는", "snow|스노우|눈", "cloud|클라우드|구름", "cloudy|클라우디|흐린", "wind|윈드|바람", "windy|윈디|바람 부는", "warm|웜|따뜻한", "cool|쿨|시원한", "storm|스톰|폭풍", "ice|아이스|얼음", "umbrella|엄브렐라|우산", "spring|스프링|봄", "summer|써머|여름", "fall|폴|가을", "winter|윈터|겨울", "sky|스카이|하늘"]),
    cat("교통", ["car|카|자동차", "bus|버스|버스", "taxi|택시|택시", "train|트레인|기차", "subway|서브웨이|지하철", "bike|바이크|자전거", "plane|플레인|비행기", "ship|쉽|배", "boat|보우트|보트", "road|로우드|도로", "street|스트리트|거리", "ticket|티킷|표", "map|맵|지도", "left|레프트|왼쪽", "right|라잇|오른쪽", "stop|스탑|정류장, 멈추다", "drive|드라이브|운전하다", "traffic|트래픽|교통(량)", "seat|씻|좌석", "way|웨이|길, 방법"])
  );

  function P(en, pron, ko, sit) { return { en: en, pron: pron, ko: ko, sit: sit }; }
  var phrases = [
    // 인사
    P("Hello, everyone.", "헬로우, 에브리원", "안녕하세요, 여러분.", "여러 사람에게 인사할 때"),
    P("Good morning.", "굿 모닝", "좋은 아침이에요.", "아침 인사"),
    P("Good afternoon.", "굿 애프터눈", "안녕하세요. (오후)", "점심 이후 인사"),
    P("How are you?", "하우 아 유", "잘 지내세요?", "안부를 물을 때"),
    P("I'm fine, thank you.", "아임 파인, 땡큐", "잘 지내요, 고마워요.", "안부 질문에 답할 때"),
    P("See you tomorrow.", "씨 유 투마로우", "내일 봐요.", "퇴근하며 헤어질 때"),
    P("Have a nice day.", "해브 어 나이스 데이", "좋은 하루 보내세요.", "헤어질 때"),
    P("Long time no see.", "롱 타임 노우 씨", "오랜만이에요.", "오랜만에 만났을 때"),
    // 자기소개
    P("Nice to meet you.", "나이스 투 밋 유", "만나서 반가워요.", "처음 만날 때"),
    P("My name is Minsu.", "마이 네임 이즈 민수", "제 이름은 민수예요.", "이름을 말할 때"),
    P("I'm from Korea.", "아임 프롬 코리아", "저는 한국에서 왔어요.", "어디서 왔는지 말할 때"),
    P("I work at MakerZ.", "아이 워크 앳 메이커즈", "저는 메이커즈에서 일해요.", "직장을 소개할 때"),
    P("What's your name?", "왓츠 유어 네임", "이름이 뭐예요?", "상대 이름을 물을 때"),
    P("I'm a designer.", "아임 어 디자이너", "저는 디자이너예요.", "직업을 말할 때"),
    P("This is my friend.", "디스 이즈 마이 프렌드", "이쪽은 제 친구예요.", "다른 사람을 소개할 때"),
    // 감사·사과
    P("Thank you.", "땡큐", "고맙습니다.", "도움을 받았을 때"),
    P("Thank you very much.", "땡큐 베리 머치", "정말 고맙습니다.", "크게 감사할 때"),
    P("You're welcome.", "유어 웰컴", "천만에요.", "감사 인사에 답할 때"),
    P("I'm sorry.", "아임 쏘리", "죄송해요.", "사과할 때"),
    P("Excuse me.", "익스큐즈 미", "실례합니다.", "말을 걸거나 지나갈 때"),
    P("No problem.", "노우 프라블럼", "괜찮아요. / 문제없어요.", "사과·부탁에 답할 때"),
    P("That's okay.", "댓츠 오케이", "괜찮아요.", "상대가 사과할 때"),
    // 부탁
    P("Can you help me?", "캔 유 헬프 미", "도와주실 수 있어요?", "도움이 필요할 때"),
    P("Please speak slowly.", "플리즈 스픽 슬로울리", "천천히 말해 주세요.", "말이 너무 빠를 때"),
    P("Can you say that again?", "캔 유 세이 댓 어겐", "다시 말해 주실래요?", "못 알아들었을 때"),
    P("I don't understand.", "아이 돈트 언더스탠드", "이해가 안 돼요.", "이해하지 못했을 때"),
    P("One moment, please.", "원 모먼트, 플리즈", "잠깐만 기다려 주세요.", "잠시 기다려 달라고 할 때"),
    P("Can I have water?", "캔 아이 해브 워터", "물 좀 주시겠어요?", "식당에서 부탁할 때"),
    P("Please write it down.", "플리즈 라이트 잇 다운", "적어 주세요.", "말을 글로 받고 싶을 때"),
    // 전화
    P("Hello, this is Minsu.", "헬로우, 디스 이즈 민수", "여보세요, 민수입니다.", "전화를 걸거나 받을 때"),
    P("May I speak to Tom?", "메이 아이 스픽 투 탐", "톰과 통화할 수 있을까요?", "특정 사람을 찾을 때"),
    P("Who's calling, please?", "후즈 콜링, 플리즈", "누구시죠?", "전화한 사람을 물을 때"),
    P("Hold on, please.", "호울드 온, 플리즈", "잠시만 기다리세요.", "전화를 연결할 때"),
    P("He's not here now.", "히즈 낫 히어 나우", "지금 자리에 없어요.", "찾는 사람이 없을 때"),
    P("I'll call you back.", "아일 콜 유 백", "다시 전화드릴게요.", "통화를 나중으로 미룰 때"),
    P("Can I take a message?", "캔 아이 테이크 어 메시지", "메시지 남겨 드릴까요?", "부재중 전화를 받을 때"),
    P("Sorry, wrong number.", "쏘리, 롱 넘버", "죄송해요, 잘못 거셨어요.", "잘못 걸린 전화일 때"),
    // 회사
    P("I have a meeting.", "아이 해브 어 미팅", "회의가 있어요.", "일정을 말할 때"),
    P("The meeting starts at ten.", "더 미팅 스타츠 앳 텐", "회의는 10시에 시작해요.", "회의 시간을 알릴 때"),
    P("Please check your email.", "플리즈 첵 유어 이메일", "이메일 확인해 주세요.", "메일을 보냈을 때"),
    P("I'll send it today.", "아일 센드 잇 투데이", "오늘 보낼게요.", "자료 보낼 날을 말할 때"),
    P("Is it finished?", "이즈 잇 피니쉬트", "다 끝났어요?", "작업 진행을 물을 때"),
    P("I'm busy now.", "아임 비지 나우", "지금 바빠요.", "바쁠 때"),
    P("Let's have lunch.", "렛츠 해브 런치", "점심 먹어요.", "점심을 제안할 때"),
    P("See you at the office.", "씨 유 앳 디 오피스", "사무실에서 봐요.", "회사에서 만나기로 할 때"),
    // 길 묻기
    P("Where is the station?", "웨어 이즈 더 스테이션", "역이 어디예요?", "역을 찾을 때"),
    P("Where is the restroom?", "웨어 이즈 더 레스트룸", "화장실이 어디예요?", "화장실을 찾을 때"),
    P("How can I get there?", "하우 캔 아이 겟 데어", "거기 어떻게 가요?", "가는 방법을 물을 때"),
    P("Go straight.", "고우 스트레잇", "똑바로 가세요.", "길을 알려 줄 때"),
    P("Turn left.", "턴 레프트", "왼쪽으로 도세요.", "길을 알려 줄 때"),
    P("Turn right.", "턴 라잇", "오른쪽으로 도세요.", "길을 알려 줄 때"),
    P("Is it far from here?", "이즈 잇 파 프롬 히어", "여기서 멀어요?", "거리를 물을 때"),
    // 쇼핑
    P("How much is this?", "하우 머치 이즈 디스", "이거 얼마예요?", "가격을 물을 때"),
    P("I'll take it.", "아일 테이크 잇", "이걸로 할게요.", "물건을 사기로 했을 때"),
    P("Just looking, thanks.", "저스트 루킹, 땡스", "그냥 둘러보는 중이에요.", "점원이 말을 걸 때"),
    P("Do you have a smaller one?", "두 유 해브 어 스몰러 원", "더 작은 거 있어요?", "다른 크기를 찾을 때"),
    P("Can I pay by card?", "캔 아이 페이 바이 카드", "카드로 계산돼요?", "계산할 때"),
    P("Can I try it on?", "캔 아이 트라이 잇 온", "입어 봐도 돼요?", "옷을 입어 볼 때"),
    P("A receipt, please.", "어 리씻, 플리즈", "영수증 주세요.", "계산 후"),
    P("It's too expensive.", "잇츠 투 익스펜시브", "너무 비싸요.", "가격이 비쌀 때")
  ];

  window.ZERO = { alphabet: alphabet, phonics: phonics, words: words, phrases: phrases };
})();
