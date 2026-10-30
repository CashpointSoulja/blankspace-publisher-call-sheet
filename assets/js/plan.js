// /plan/: sends per variant for a two-proportion test (two-sided α = 0.05, power 0.8).

const Z_ALPHA = 1.959964;
const Z_BETA = 0.841621;

export function sendsPerVariant(p1, p2) {
  if (!(p1 > 0 && p1 < 1 && p2 > 0 && p2 < 1) || p1 === p2) return null;
  const pbar = (p1 + p2) / 2;
  const a = Z_ALPHA * Math.sqrt(2 * pbar * (1 - pbar));
  const b = Z_BETA * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((a + b) ** 2 / (p1 - p2) ** 2);
}

const form = document.getElementById("calc");
const out = document.getElementById("calc-n");
if (form && out) {
  const update = () => {
    const n = sendsPerVariant(Number(form.p1.value) / 100, Number(form.p2.value) / 100);
    out.textContent = n === null ? "Enter two different rates" : n.toLocaleString("en-GB");
  };
  form.addEventListener("input", update);
  form.addEventListener("submit", (e) => e.preventDefault());
  update();
}
