// script.js
// 지뢰찾기 게임의 핵심 로직을 담당하는 파일입니다.
// 이 코드는 16x16 그리드(2배수 격자)를 생성하고 지뢰를 심어 동작하도록 작성되었습니다.

// --- 설정 변수 (상수) ---
const ROWS = 16; // 가로 줄 개수
const COLS = 16; // 세로 줄 개수
const TOTAL_MINES = 40; // 배치할 총 지뢰 개수

// --- HTML 요소 선택 ---
const boardElement = document.getElementById("game-board");
const mineCountElement = document.getElementById("mine-count");
const timerElement = document.getElementById("timer");
const restartBtn = document.getElementById("restart-btn");
const gameMessage = document.getElementById("game-message");
const messageText = document.getElementById("message-text");

// --- 게임 상태를 저장할 변수들 ---
let grid = []; // 각 칸의 데이터를 저장할 2차원 배열
let minesLeft = TOTAL_MINES; // 남은 지뢰(깃발) 개수
let isGameOver = false; // 게임 오버 여부
let cellsRevealed = 0; // 열린 칸의 개수 (승리 조건 체크용)
let timerInterval = null; // 타이머를 제어하기 위한 변수
let timeElapsed = 0; // 흐른 시간(초)
let isFirstClick = true; // 첫 클릭 여부 (첫 클릭 시 타이머 시작)

// --- 효과음 생성 도구 (Web Audio API) ---
// 오디오 파일을 별도로 다운로드하지 않아도 브라우저에서 직접 짧고 경쾌한 소리를 만들어냅니다.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClickSound() {
    // 보안 정책상 사용자가 브라우저와 상호작용하기 전에 오디오가 막혀있을 수 있으므로 다시 깨워줍니다.
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // 소리를 만들어내는 객체 생성
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // 짧은 '틱' 느낌의 맑은 소리를 설정합니다.
    oscillator.type = 'sine'; // 부드러운 사인파(정현파)
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); // 주파수 시작 (약간 높은 음)
    oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05); // 짧은 시간에 주파수 하락

    // 볼륨(크기) 설정 및 짧게 서서히 줄어드는 효과 (페이드 아웃)
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); // 적당한 볼륨
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

    // 객체들 연결 (소리 발생기 -> 볼륨 조절기 -> 스피커)
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // 0.05초간 소리를 재생하고 멈춤
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
}

// --- 게임 시작 함수 ---
function initGame() {
    // 1. 상태 변수 초기화
    grid = [];
    minesLeft = TOTAL_MINES;
    isGameOver = false;
    cellsRevealed = 0;
    isFirstClick = true;
    timeElapsed = 0;
    clearInterval(timerInterval);

    // UI 초기화
    mineCountElement.innerText = minesLeft;
    timerElement.innerText = "000";
    boardElement.innerHTML = ""; // 기존 그리드 지우기
    gameMessage.classList.add("hidden"); // 게임 메시지 숨기기

    // 2. 16x16 그리드(배열) 생성
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            // 각 칸(셀)의 기본 정보를 객체로 정의합니다.
            const cellData = {
                r: r,               // 행 번호
                c: c,               // 열 번호
                isMine: false,      // 지뢰 여부 (기본은 false)
                isRevealed: false,  // 열려있는지 여부
                isFlagged: false,   // 깃발이 꽂혀있는지 여부
                neighborMines: 0,   // 주변(8방향)에 있는 지뢰 개수
                element: null       // 화면에 보여질 HTML 요소 연결
            };

            // 화면에 그릴 HTML div 요소 생성
            const cellElement = document.createElement("div");
            cellElement.classList.add("cell");

            // 이벤트 리스너 연결 (좌클릭과 우클릭)
            // 클릭 시 어떤 행동을 할지 연결해 줍니다.
            cellElement.addEventListener("click", () => handleCellClick(cellData));
            cellElement.addEventListener("contextmenu", (e) => {
                e.preventDefault(); // 기본 우클릭 메뉴 안 뜨게 막기
                handleRightClick(cellData);
            });

            cellData.element = cellElement;
            boardElement.appendChild(cellElement); // 화면에 추가
            row.push(cellData);
        }
        grid.push(row);
    }

    // 3. 지뢰 무작위 배치
    placeMines();

    // 4. 각 칸별로 주변 지뢰 개수 계산
    calculateNeighborMines();
}

// --- 지뢰를 무작위로 심는 함수 ---
function placeMines() {
    let minesPlaced = 0;
    while (minesPlaced < TOTAL_MINES) {
        // 무작위 행과 열 추출
        const randomR = Math.floor(Math.random() * ROWS);
        const randomC = Math.floor(Math.random() * COLS);

        const cell = grid[randomR][randomC];
        // 아직 지뢰가 없는 칸이라면 지뢰를 심습니다.
        if (!cell.isMine) {
            cell.isMine = true;
            minesPlaced++;
        }
    }
}

// --- 각 칸 주변 8방향의 지뢰 개수를 세는 함수 ---
function calculateNeighborMines() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.isMine) continue; // 지뢰인 경우 셀 필요 없음

            let count = 0;
            // 주변 8방향 탐색을 위한 반복문 (-1, 0, 1 차이)
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    // 그리드 범위 안에 있고, 그 칸이 지뢰라면 카운트 증가
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        if (grid[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
            }
            cell.neighborMines = count; // 계산된 개수를 저장
        }
    }
}

// --- 셀 좌클릭(열기) 이벤트 처리 함수 ---
function handleCellClick(cell) {
    if (isGameOver || cell.isRevealed || cell.isFlagged) return; // 클릭 무시 조건

    // 클랙했을 때 '틱' 효과음을 재생합니다.
    playClickSound();

    // 첫 클릭 시 타이머 시작
    if (isFirstClick) {
        startTimer();
        isFirstClick = false;
    }

    // 만약 지뢰를 클릭했다면?
    if (cell.isMine) {
        revealAllMines(); // 모든 지뢰 보여주기
        gameOver(false); // 패배 처리
        return;
    }

    // 빈 칸 열기 처리 (재귀적으로 주변 탐색)
    revealCell(cell);

    // 승리 조건 체크 (전체 칸 수 - 지뢰 수 == 열린 칸 수)
    if (cellsRevealed === (ROWS * COLS - TOTAL_MINES)) {
        gameOver(true); // 승리 처리
    }
}

// --- 칸을 여는 실제 동작 (빈 칸일 경우 주변 칸도 엶) ---
function revealCell(cell) {
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cellsRevealed++;
    cell.element.classList.add("revealed");

    // 주변 지뢰 개수가 0보다 크면 숫자 표시
    if (cell.neighborMines > 0) {
        cell.element.innerText = cell.neighborMines;
        cell.element.classList.add(`color-${cell.neighborMines}`); // 숫자에 맞춰 색상 입히기
    } else {
        // 주변 지뢰 개수가 0이면, 주변 8방향 칸들도 연쇄적으로 열어줍니다 (재귀 호출)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = cell.r + dr;
                const nc = cell.c + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                    revealCell(grid[nr][nc]);
                }
            }
        }
    }
}

// --- 셀 우클릭(깃발 꽂기) 이벤트 처리 함수 ---
function handleRightClick(cell) {
    if (isGameOver || cell.isRevealed) return; // 이미 끝났거나 열린 칸은 무시

    // 깃발을 꽂거나 뺄 때도 경쾌하게 소리를 냅니다.
    playClickSound();

    // 깃발 상태 토글(껐다 켜기)
    if (!cell.isFlagged) {
        cell.isFlagged = true;
        cell.element.innerText = "🚩";
        minesLeft--; // 화면의 남은 지뢰수 감소
    } else {
        cell.isFlagged = false;
        cell.element.innerText = "";
        minesLeft++; // 화면의 남은 지뢰수 원상복구
    }

    // UI 업데이트
    mineCountElement.innerText = minesLeft;
}

// --- 게임 종료 시 모든 지뢰를 화면에 보여주는 함수 ---
function revealAllMines() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (cell.isMine) {
                cell.isRevealed = true;
                cell.element.classList.add("revealed", "mine");
                cell.element.innerText = "💣";
            }
        }
    }
}

// --- 타이머 시작 함수 ---
function startTimer() {
    timerInterval = setInterval(() => {
        timeElapsed++;
        // 시간을 3자리 문자열로 포맷팅 (예: 1 -> 001)
        timerElement.innerText = timeElapsed.toString().padStart(3, '0');
    }, 1000);
}

// --- 게임 오버 및 승리 처리 함수 ---
function gameOver(isWin) {
    isGameOver = true;
    clearInterval(timerInterval); // 타이머 멈춤

    gameMessage.classList.remove("hidden"); // 메시지 창 보이기

    if (isWin) {
        messageText.innerText = "승리했습니다! 🎉";
        messageText.style.color = "#50e3c2"; // 승리 시 초록빛
    } else {
        messageText.innerText = "게임 오버! 💣";
        messageText.style.color = "#ff4a4a"; // 패배 시 붉은빛
    }
}

// --- 재시작 버튼 이벤트 연결 ---
restartBtn.addEventListener("click", () => {
    initGame(); // 게임 재설정 함수 호출
});

// --- 처음에 게임 시작 ---
initGame();
