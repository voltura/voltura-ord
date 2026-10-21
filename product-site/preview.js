// A decorative sample, not a playable board. Full game: ord.voltura.se.
const board = document.querySelector('.preview-board');
const letters = new Map();
const points = { S: 1, O: 1, M: 2, A: 1, R: 1, L: 1, D: 1 };
for (const [row, column, word, vertical] of [[5, 2, 'SOMMAR', false], [5, 2, 'SOL', true], [3, 7, 'ORD', true]]) {
  [...word].forEach((letter, index) => letters.set((row + (vertical ? index : 0)) * 11 + column + (vertical ? 0 : index), letter));
}
const fragment = document.createDocumentFragment();
for (let row = 0; row < 11; row++) {
  for (let column = 0; column < 11; column++) {
    const cell = document.createElement('span');
    cell.className = 'cell';
    const letter = letters.get(row * 11 + column);
    if (letter) {
      cell.classList.add('letter');
      cell.textContent = letter;
      const score = document.createElement('small');
      score.textContent = points[letter];
      cell.append(score);
    } else {
      const edge = (row === 0 || row === 10) && (column === 0 || column === 5 || column === 10);
      const side = (column === 0 || column === 10) && row === 5;
      const diagonal = row === column || row + column === 10;
      const blue = (row === 2 || row === 8) && (column === 4 || column === 6) || (row === 4 || row === 6) && (column === 2 || column === 8);
      if (edge || side) { cell.classList.add('red'); cell.textContent = '3×O'; }
      else if (row === 5 && column === 5) { cell.classList.add('orange'); cell.textContent = '★'; }
      else if (diagonal && row % 2 === 1) { cell.classList.add('pink'); cell.textContent = '2×O'; }
      else if (blue) { cell.classList.add('blue'); cell.textContent = '2×B'; }
    }
    fragment.append(cell);
  }
}
board.append(fragment);
