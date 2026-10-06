// Just enough statistics to test a generator: Pearson's chi-square statistic and its p-value.

/** Pearson's statistic: the sum over cells of (observed - expected)^2 / expected. */
export function chiSquare(observed: ArrayLike<number>, expected: number): number {
  let sum = 0;
  for (let i = 0; i < observed.length; i++) sum += (observed[i] - expected) ** 2 / expected;
  return sum;
}

/** Pearson's statistic against a different expected count for each cell. */
export function chiSquareEach(observed: ArrayLike<number>, expected: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < observed.length; i++) sum += (observed[i] - expected[i]) ** 2 / expected[i];
  return sum;
}

/** ln Gamma(x), Lanczos approximation (accurate to ~1e-10 for x > 0). */
function logGamma(x: number): number {
  const c = [76.18009172947146, -86.5053203294168, 24.0140982408309, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (const coefficient of c) series += coefficient / ++y;
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * series) / x);
}

/** Regularised upper incomplete gamma function Q(a, x) (Numerical Recipes: series below a + 1, continued fraction above). */
function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 10000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** P(chi-square with `df` degrees of freedom >= `statistic`): small when the observed counts are too far from the expected ones. */
export function chiSquarePValue(statistic: number, df: number): number {
  return gammaQ(df / 2, statistic / 2);
}
