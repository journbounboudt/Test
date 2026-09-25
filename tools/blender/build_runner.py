"""
VOID RUSH hero runner — authored entirely in code, deterministic.

  blender -b --factory-startup --python tools/blender/build_runner.py -- [--out raw.glb] [--render DIR]

Geometry is built on parametric lofts (superellipse cross-sections interpolated along an axis).
The undersuit is the loft surface itself; armour plates are polygons in (angle, s) loft space that
are projected onto the surface, thickened and bevelled; glow trims are ribbons inlaid in the gaps
between plates. Skin weights come from the loft parameter, so plates never tear from the body.

Blender space: character faces -Y, his left is +X. The armature object is turned 180° at export so
three.js sees him facing -Z (the gameplay camera behind at +Z sees his back).
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


OUT = arg('--out', '/tmp/runner.raw.glb')
RENDER = arg('--render')
RENDER_ONLY = arg('--shots')

SUIT, PLATE, TRIM, VISOR = range(4)
MAT_NAMES = ['Suit', 'Plate', 'Trim', 'Visor']

# ----------------------------------------------------------------------------------------------
# Math helpers


def cr(a, b, c, d, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def periodic(keys, p):
    """Periodic Catmull-Rom through (phase, value) keys, phase in [0,1)."""
    p %= 1.0
    n = len(keys)
    i = n - 1
    for k in range(n):
        if keys[k][0] > p:
            i = k - 1
            break
    def key(j):
        q, v = keys[j % n]
        return q + (j // n) * 1.0, v
    p0, v0 = key(i - 1)
    p1, v1 = key(i)
    p2, v2 = key(i + 1)
    p3, v3 = key(i + 2)
    if p < p1:
        p += 1.0
    t = (p - p1) / (p2 - p1)
    return cr(v0, v1, v2, v3, t)


def chain(bones, joints, blends):
    """Weight function of loft parameter s: bones[0] | joint[0] | bones[1] | ..."""
    if not isinstance(blends, (list, tuple)):
        blends = [blends] * len(joints)

    def f(s):
        ts = [smooth((s - j + b) / (2 * b)) for j, b in zip(joints, blends)]
        w = {}
        prev = 1.0
        for k, bone in enumerate(bones):
            nxt = ts[k] if k < len(ts) else 0.0
            val = (1.0 - nxt) if k == 0 else (ts[k - 1] - nxt)
            if val > 1e-4:
                w[bone] = w.get(bone, 0) + val
            prev = nxt
        return w
    return f


def mirror_name(n):
    return n[:-2] + '.R' if n.endswith('.L') else n[:-2] + '.L' if n.endswith('.R') else n


# ----------------------------------------------------------------------------------------------
# Geometry accumulator


class Geo:
    def __init__(self):
        self.v, self.f, self.m, self.w = [], [], [], []

    def _add(self, verts, faces, mat, weights):
        base = len(self.v)
        self.v.extend(verts)
        self.w.extend(weights)
        for f in faces:
            self.f.append(tuple(i + base for i in f))
            self.m.append(mat)

    def add(self, verts, faces, mat, weights, mirror=False):
        if isinstance(weights, dict):
            weights = [weights] * len(verts)
        self._add(verts, faces, mat, weights)
        if mirror:
            mv = [Vector((-p.x, p.y, p.z)) for p in verts]
            mf = [tuple(reversed(f)) for f in faces]
            mw = [{mirror_name(k): v for k, v in w.items()} for w in weights]
            self._add(mv, mf, mat, mw)


GEO = Geo()

# ----------------------------------------------------------------------------------------------
# Loft

RKEYS = ('rx', 'rf', 'rb', 'nf', 'nb')


class Loft:
    def __init__(self, rings, xform=None, front=(0, -1, 0), side=(1, 0, 0), wfun=None, n=2.3):
        self.r = []
        for r in rings:
            d = dict(r)
            d.setdefault('nf', r.get('n', n))
            d.setdefault('nb', r.get('n', n))
            d['c'] = Vector(d['c'])
            self.r.append(d)
        self.X = xform if xform is not None else Matrix.Identity(4)
        self.X3 = self.X.to_3x3()
        self.F0 = Vector(front)
        self.S0 = Vector(side)
        self.wfun = wfun
        self.s0 = self.r[0]['s']
        self.s1 = self.r[-1]['s']
        self._cache = {}

    def ring(self, s):
        R = self.r
        s = min(max(s, self.s0), self.s1)
        i = 0
        while i < len(R) - 2 and s > R[i + 1]['s']:
            i += 1
        t = (s - R[i]['s']) / (R[i + 1]['s'] - R[i]['s'])
        a, b, c, d = R[max(i - 1, 0)], R[i], R[i + 1], R[min(i + 2, len(R) - 1)]
        out = {k: cr(a[k], b[k], c[k], d[k], t) for k in RKEYS}
        out['c'] = cr(a['c'], b['c'], c['c'], d['c'], t)
        for k in ('rx', 'rf', 'rb'):
            out[k] = max(out[k], 0.0005)
        for k in ('nf', 'nb'):
            out[k] = max(out[k], 1.2)
        return out

    def frame(self, s):
        key = round(s, 7)
        hit = self._cache.get(key)
        if hit:
            return hit
        r = self.ring(s)
        e = 2e-3
        T = self.ring(min(s + e, self.s1))['c'] - self.ring(max(s - e, self.s0))['c']
        if T.length < 1e-9:
            T = self.r[-1]['c'] - self.r[0]['c']
        T.normalize()
        F = self.F0 - T * self.F0.dot(T)
        F.normalize()
        S = T.cross(F)
        if S.dot(self.S0) < 0:
            S = -S
        hit = (r, S, F)
        self._cache[key] = hit
        return hit

    def local(self, th, s):
        r, S, F = self.frame(s)
        a = math.radians(th)
        ca, sa = math.cos(a), math.sin(a)
        if sa >= 0:
            e = 2.0 / r['nf']
            y = r['rf'] * abs(sa) ** e
        else:
            e = 2.0 / r['nb']
            y = -r['rb'] * abs(sa) ** e
        x = r['rx'] * spow(ca, e)
        return r['c'] + S * x + F * y, r['c']

    def point(self, th, s, off=0.0):
        P, C = self.local(th, s)
        Pa, _ = self.local(th + 0.6, s)
        Pb, _ = self.local(th - 0.6, s)
        ds = 0.0015
        Pc, _ = self.local(th, min(s + ds, self.s1))
        Pd, _ = self.local(th, max(s - ds, self.s0))
        N = (Pa - Pb).cross(Pc - Pd)
        if N.length < 1e-12:
            N = P - C
        N.normalize()
        if N.dot(P - C) < 0:
            N = -N
        return self.X @ (P + N * off), (self.X3 @ N).normalized()

    def weights(self, s):
        return self.wfun(s)

    def body(self, nu, nv, mat=SUIT, caps=(True, True), mirror=False, s_range=None):
        s0, s1 = s_range or (self.s0, self.s1)
        verts, weights, norms = [], [], []
        for j in range(nv):
            s = s0 + (s1 - s0) * j / (nv - 1)
            for i in range(nu):
                P, N = self.point(360.0 * i / nu, s)
                verts.append(P)
                norms.append(N)
                weights.append(self.weights(s))
        faces = []
        for j in range(nv - 1):
            for i in range(nu):
                a, b = j * nu + i, j * nu + (i + 1) % nu
                faces.append((a, b, b + nu, a + nu))
        mid = ((nv - 1) // 2) * nu
        fa = verts[mid + 1] - verts[mid]
        fb = verts[mid + nu] - verts[mid]
        if fa.cross(fb).dot(norms[mid]) < 0:
            faces = [tuple(reversed(f)) for f in faces]
        centre = self.X @ self.ring((s0 + s1) / 2)['c']
        for end, s in ((0, s0), (1, s1)):
            if not caps[end]:
                continue
            ci = len(verts)
            verts.append(self.X @ self.ring(s)['c'])
            weights.append(self.weights(s))
            row = 0 if end == 0 else (nv - 1) * nu
            for i in range(nu):
                tri = (ci, row + i, row + (i + 1) % nu)
                n = (verts[tri[1]] - verts[tri[0]]).cross(verts[tri[2]] - verts[tri[0]])
                cen = (verts[tri[0]] + verts[tri[1]] + verts[tri[2]]) / 3
                if n.dot(cen - centre) < 0:
                    tri = tuple(reversed(tri))
                faces.append(tri)
        GEO.add(verts, faces, mat, weights, mirror)


# ----------------------------------------------------------------------------------------------
# Plates and trims


def scan(poly, s):
    xs = []
    n = len(poly)
    for i in range(n):
        (t1, s1), (t2, s2) = poly[i], poly[(i + 1) % n]
        if min(s1, s2) - 1e-9 <= s <= max(s1, s2) + 1e-9:
            if abs(s2 - s1) < 1e-9:
                xs += [t1, t2]
            else:
                xs.append(t1 + (t2 - t1) * (s - s1) / (s2 - s1))
    return min(xs), max(xs)


def shell(top, bot, nr, nc, mat, weights, mirror, bevel=0.0, seg=2, wrap=False, profile=0.5, closed=False):
    """Top grid (nr x nc) extruded down to `bot` along its border, optional border bevel. `closed` adds the
    underside for plates that stand off the body (pauldrons), which would otherwise look hollow when culled."""
    bm = bmesh.new()
    T = [bm.verts.new(p) for p in top]
    B = [bm.verts.new(p) for p in bot]
    quads = []
    cols = nc if wrap else nc - 1
    for k in range(nr - 1):
        for c in range(cols):
            a, b = k * nc + c, k * nc + (c + 1) % nc
            quads.append((a, b, b + nc, a + nc))
    q = quads[len(quads) // 2]
    n = (top[q[1]] - top[q[0]]).cross(top[q[3]] - top[q[0]])
    if n.dot(top[q[0]] - bot[q[0]]) < 0:
        quads = [tuple(reversed(x)) for x in quads]
    count = {}
    for x in quads:
        for e in zip(x, x[1:] + x[:1]):
            key = frozenset(e)
            count[key] = count.get(key, 0) + 1
    border = []
    for x in quads:
        try:
            bm.faces.new([T[i] for i in x])
        except ValueError:
            pass
    for x in quads:
        for a, b in zip(x, x[1:] + x[:1]):
            if count[frozenset((a, b))] == 1:
                border.append((a, b))
                try:
                    bm.faces.new([T[b], T[a], B[a], B[b]])
                except ValueError:
                    pass
    if closed:
        for x in quads:
            try:
                bm.faces.new([B[i] for i in reversed(x)])
            except ValueError:
                pass
    for v in list(bm.verts):
        if not v.link_faces:
            bm.verts.remove(v)
    if bevel > 0:
        edges = []
        for a, b in border:
            e = bm.edges.get((T[a], T[b]))
            if e:
                edges.append(e)
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, offset_type='OFFSET', segments=seg, profile=profile,
                        affect='EDGES', clamp_overlap=True)
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    if isinstance(weights, dict):
        w = weights
    else:
        # per-vertex weights only survive without bevel (vertex order = T then B minus loose)
        lookup = {}
        for i, p in enumerate(top):
            lookup[p.to_tuple(6)] = weights[i]
        for i, p in enumerate(bot):
            lookup[p.to_tuple(6)] = weights[i]
        w = [lookup.get(v.to_tuple(6), weights[0]) for v in verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    GEO.add(verts, faces, mat, w, mirror)


def rows_for(poly, res):
    ss = sorted(p[1] for p in poly)
    smin, smax = ss[0], ss[-1]
    eps = max(1e-4, (smax - smin) * 0.004)
    vals = set([smin + eps, smax - eps])
    for s in ss:
        vals.add(min(max(s, smin + eps), smax - eps))
    n = max(1, math.ceil((smax - smin) / res))
    for k in range(1, n):
        vals.add(smin + (smax - smin) * k / n)
    out = []
    for s in sorted(vals):
        if not out or s - out[-1] > res * 0.3:
            out.append(s)
    if out[-1] < smax - eps - 1e-6:
        out.append(smax - eps)
    return out


def plate(L, poly, off=0.004, th=0.012, bulge=0.0, mat=PLATE, res=0.026, bevel=0.0035, seg=1, mirror=True,
          w=None, profile=0.5, closed=False):
    rows = rows_for(poly, res)
    spans = [scan(poly, s) for s in rows]
    mid = L.ring((rows[0] + rows[-1]) / 2)
    rad = (mid['rx'] + mid['rf'] + mid['rb']) / 3
    maxw = max(hi - lo for lo, hi in spans)
    nc = max(2, math.ceil(math.radians(maxw) * rad / res) + 1)
    nr = len(rows)
    top, bot = [], []
    for k, (s, (lo, hi)) in enumerate(zip(rows, spans)):
        tv = k / (nr - 1)
        for c in range(nc):
            u = c / (nc - 1)
            P, N = L.point(lo + (hi - lo) * u, s)
            b = bulge * math.sin(math.pi * u) * math.sin(math.pi * tv)
            top.append(P + N * (off + th + b))
            bot.append(P + N * off)
    sc = sum(p[1] for p in poly) / len(poly)
    shell(top, bot, nr, nc, mat, w if w is not None else L.weights(sc), mirror, bevel, seg, profile=profile,
          closed=closed)


def band(L, s0, s1, off=0.004, th=0.012, mat=PLATE, res=0.02, bevel=0.003, seg=1, mirror=False, w=None, nu=None):
    n = max(2, math.ceil((s1 - s0) / res) + 1)
    r = L.ring((s0 + s1) / 2)
    nu = nu or max(12, int(2 * math.pi * max(r['rx'], r['rf'], r['rb']) / res))
    top, bot = [], []
    for k in range(n):
        s = s0 + (s1 - s0) * k / (n - 1)
        for i in range(nu):
            P, N = L.point(360.0 * i / nu, s)
            top.append(P + N * (off + th))
            bot.append(P + N * off)
    shell(top, bot, n, nu, mat, w if w is not None else L.weights((s0 + s1) / 2), mirror, bevel, seg, wrap=True)


def trim(L, pts, width=0.008, off=0.012, depth=0.01, mat=TRIM, res=0.018, mirror=True, w=None):
    samples = []
    for a, b in zip(pts, pts[1:]):
        Pa, _ = L.point(*a)
        Pb, _ = L.point(*b)
        n = max(1, math.ceil((Pb - Pa).length / res))
        for i in range(n):
            t = i / n
            samples.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    samples.append(pts[-1])
    PN = [L.point(t, s) for t, s in samples]
    top, bot, ws = [], [], []
    for i, (P, N) in enumerate(PN):
        tan = PN[min(i + 1, len(PN) - 1)][0] - PN[max(i - 1, 0)][0]
        side = N.cross(tan).normalized() * (width / 2)
        for sg in (-1, 1):
            top.append(P + N * off + side * sg)
            bot.append(P + N * (off - depth) + side * sg)
            ws.append(w if w is not None else L.weights(samples[i][1]))
    shell(top, bot, len(PN), 2, mat, ws, mirror)


def rect(t0, t1, s0, s1, ct=0.0, cs=0.0, cut=(1, 1, 1, 1)):
    """Chamfered rectangle in (angle, s): corners (t0,s0),(t1,s0),(t1,s1),(t0,s1)."""
    C = [(t0, s0), (t1, s0), (t1, s1), (t0, s1)]
    pts = []
    for k, (t, s) in enumerate(C):
        if not (cut[k] and (ct or cs)):
            pts.append((t, s))
            continue
        for other in (C[k - 1], C[(k + 1) % 4]):
            if other[1] == s:  # edge along angle
                pts.append((t + math.copysign(ct, other[0] - t), s))
            else:
                pts.append((t, s + math.copysign(cs, other[1] - s)))
    return pts


def ngon(tc, sc, rt, rs, n=8, rot=22.5):
    return [(tc + rt * math.cos(math.radians(rot + 360 * i / n)), sc + rs * math.sin(math.radians(rot + 360 * i / n)))
            for i in range(n)]


# ----------------------------------------------------------------------------------------------
# Skeleton layout (Blender space, metres)

HIP_J = Vector((0.098, 0.0, 0.965))
LEG_ABD = math.radians(1.5)
LEG_KNEE, LEG_ANKLE = 0.458, 0.905
SHO_J = Vector((0.214, 0.004, 1.518))
ARM_ABD = math.radians(36)
ARM_ELBOW, ARM_WRIST = 0.305, 0.570
FOOT_SCALE = Vector((0.94, 0.92, 0.94))
HAND_SCALE = 0.9

LEG_X = Matrix.Translation(HIP_J) @ Matrix.Rotation(-LEG_ABD, 4, 'Y')
ARM_X = Matrix.Translation(SHO_J) @ Matrix.Rotation(-ARM_ABD, 4, 'Y')
KNEE = LEG_X @ Vector((0, 0, -LEG_KNEE))
ANKLE = LEG_X @ Vector((0, 0, -LEG_ANKLE))
ELBOW = ARM_X @ Vector((0, 0, -ARM_ELBOW))
WRIST = ARM_X @ Vector((0, 0, -ARM_WRIST))
HAND_X = Matrix.Translation(WRIST) @ Matrix.Rotation(-ARM_ABD, 4, 'Y')
HAND_S = HAND_X @ Matrix.Scale(HAND_SCALE, 4)
FOOT_X = Matrix.Translation(ANKLE)
FOOT_S = FOOT_X @ Matrix.Diagonal((*FOOT_SCALE, 1.0))
BALL = ANKLE + Vector((0, -0.097, -0.070))
TOE = ANKLE + Vector((0, -0.175, -0.076))
# Geometry is authored with the hip at 0.965; the long legs end below z=0, so everything but the root bone
# is lifted to put the boot soles on the ground in the bind pose.
SOLE = 0.104 * FOOT_SCALE.z
LIFT = round(SOLE - ANKLE.z, 4)
UP = Vector((0, 0, LIFT))

# ----------------------------------------------------------------------------------------------
# Body


def TZ(z):
    """Torso loft parameter (authoring height) -> world height; stretches the chest for heroic proportions."""
    return z if z <= 1.10 else 1.10 + (z - 1.10) * 1.10


def R(s, c, rx, rf, rb, **kw):
    d = dict(s=s, c=c, rx=rx, rf=rf, rb=rb)
    d.update(kw)
    return d


def build():
    # ---------------- torso (V-taper: broad chest, narrow waist) -------------------------------
    tz = [
        (0.855, 0.004, 0.040, 0.036, 0.040),
        (0.895, 0.004, 0.122, 0.080, 0.090),
        (0.955, 0.008, 0.150, 0.094, 0.112),
        (1.020, 0.006, 0.143, 0.092, 0.104),
        (1.090, 0.002, 0.121, 0.086, 0.086),
        (1.150, 0.000, 0.128, 0.093, 0.086),
        (1.230, -0.004, 0.164, 0.110, 0.095),
        (1.310, -0.008, 0.203, 0.129, 0.106),
        (1.390, -0.008, 0.228, 0.134, 0.111),
        (1.455, -0.004, 0.224, 0.118, 0.111),
        (1.505, 0.000, 0.174, 0.092, 0.100),
        (1.548, 0.002, 0.098, 0.068, 0.075),
        (1.568, 0.002, 0.052, 0.042, 0.046),
    ]
    torso_w = chain(['hips', 'spine', 'chest'], [1.10, 1.27], 0.07)
    torso = Loft([R(z, (0, y, TZ(z)), rx, rf, rb, nf=2.6, nb=2.4) for z, y, rx, rf, rb in tz], front=(0, -1, 0),
                 side=(1, 0, 0), wfun=torso_w)
    torso.body(36, 30)

    # neck (visible between collar and helmet) + collar
    neck = Loft([R(1.55, (0, 0.004, 1.55), 0.056, 0.052, 0.058), R(1.62, (0, 0.002, 1.62), 0.049, 0.046, 0.051),
                 R(1.70, (0, -0.004, 1.70), 0.046, 0.044, 0.048)],
                wfun=chain(['chest', 'neck', 'head'], [1.585, 1.665], 0.03))
    neck.body(16, 8)
    band(neck, 1.614, 1.626, off=0.0, th=0.006, res=0.02, bevel=0.002, w={'neck': 1.0})
    collar = Loft([R(1.530, (0, 0.002, 1.530), 0.146, 0.110, 0.122), R(1.565, (0, 0.004, 1.565), 0.118, 0.094, 0.104),
                   R(1.600, (0, 0.006, 1.600), 0.086, 0.074, 0.082)],
                  n=2.4, wfun=lambda s: {'chest': 0.7, 'neck': 0.3})
    band(collar, 1.535, 1.594, off=0.0, th=0.012, res=0.02, bevel=0.0035)
    trim(collar, [(-150, 1.566), (-30, 1.566)], width=0.008, off=0.0125, depth=0.006, mirror=False)

    # ---------------- torso armour --------------------------------------------------------------
    # chest: pecs leave a V channel at the sternum where the shield-shaped core sits
    pec = [(16, 1.318), (56, 1.300), (77, 1.352), (81, 1.452), (58, 1.492), (20, 1.474)]
    plate(torso, pec, off=0.004, th=0.017, bulge=0.007, bevel=0.0042, seg=2)
    plate(torso, [(81, 1.460), (99, 1.460), (98, 1.422), (90, 1.374), (82, 1.422)], off=0.004, th=0.009,
          mat=TRIM, bevel=0.0015, seg=1, mirror=False, res=0.012)
    trim(torso, [(81.0, 1.466), (60, 1.502), (30, 1.508)], width=0.008, off=0.011, depth=0.008)
    plate(torso, [(28, 1.514), (58, 1.512), (81, 1.476), (88.5, 1.478), (88.5, 1.534), (30, 1.544)], off=0.004,
          th=0.012, bevel=0.003)
    trim(torso, [(77.5, 1.347), (57, 1.289), (19, 1.305)], width=0.008, off=0.011, depth=0.008)
    # abs: overlapping lames, upper over lower
    for k, (s0, s1) in enumerate(((1.232, 1.286), (1.177, 1.237), (1.120, 1.181))):
        plate(torso, rect(66.5, 87.5, s0, s1, ct=3, cs=0.008, cut=(1, 0, 0, 1)), off=0.009 - k * 0.003, th=0.011,
              bulge=0.004, bevel=0.003, res=0.016)
    trim(torso, [(90, 1.125), (90, 1.352)], width=0.006, off=0.008, depth=0.006, mirror=False)
    # obliques / ribs
    plate(torso, [(22, 1.150), (61, 1.134), (61, 1.278), (24, 1.292), (14, 1.24)], off=0.003, th=0.012,
          bulge=0.003, bevel=0.0032)
    trim(torso, [(18, 1.16), (13.5, 1.235), (18, 1.285)], width=0.008, off=0.009, depth=0.008)
    plate(torso, [(-22, 1.225), (10, 1.215), (12, 1.40), (-18, 1.42)], off=0.003, th=0.011, bevel=0.003)
    # back: shoulder blades + lower back framing the signature glowing spine and cross
    plate(torso, [(-84.5, 1.352), (-42, 1.344), (-19, 1.40), (-23, 1.472), (-60, 1.500), (-84.5, 1.492)], off=0.004,
          th=0.018, bulge=0.006, bevel=0.0042, seg=2)
    plate(torso, [(-84.5, 1.168), (-36, 1.160), (-28, 1.24), (-32, 1.330), (-84.5, 1.336)], off=0.003, th=0.015,
          bulge=0.004, bevel=0.0038)
    trim(torso, [(-90, 1.150), (-90, 1.500)], width=0.05, off=0.012, depth=0.012, mirror=False, res=0.02)
    trim(torso, [(-84, 1.3435), (-44, 1.3375), (-28, 1.34)], width=0.016, off=0.011, depth=0.008)
    trim(torso, [(-60, 1.505), (-84, 1.502)], width=0.014, off=0.016, depth=0.008)
    # belt with buckle, utility pouches and hip plates
    band(torso, 0.985, 1.045, off=0.003, th=0.013, res=0.022, bevel=0.0035)
    plate(torso, rect(76, 104, 0.975, 1.055, ct=4, cs=0.012), off=0.016, th=0.010, bevel=0.003, mirror=False)
    trim(torso, [(82, 1.015), (98, 1.015)], width=0.008, off=0.0265, depth=0.006, mirror=False)
    trim(torso, [(-72, 1.015), (-108, 1.015)], width=0.008, off=0.0165, depth=0.006, mirror=False)
    plate(torso, rect(22, 44, 0.978, 1.048, ct=3, cs=0.01), off=0.016, th=0.022, bevel=0.004, res=0.014)
    plate(torso, rect(-36, 18, 0.908, 0.978, ct=8, cs=0.02, cut=(1, 1, 0, 0)), off=0.008, th=0.011, bevel=0.0032)
    plate(torso, [(74, 0.905), (106, 0.905), (110, 0.978), (70, 0.978)], off=0.006, th=0.012, bevel=0.003,
          mirror=False)
    plate(torso, rect(-150, -30, 1.052, 1.11, ct=0, cs=0), off=0.004, th=0.010, bevel=0.003, mirror=False)
    for t in (-122, -58):
        plate(torso, rect(t - 11, t + 11, 0.955, 0.985, ct=3, cs=0.008), off=0.016, th=0.018, bevel=0.004,
              mirror=False, res=0.012)

    # ---------------- legs: tapered thighs, defined calves --------------------------------------
    K, A = LEG_KNEE, LEG_ANKLE
    leg_w = chain(['hips', 'thigh.L', 'shin.L', 'foot.L'], [0.0, K, A], [0.05, 0.035, 0.03])
    lr = [
        R(-0.085, (0, 0.000, 0.085), 0.062, 0.062, 0.062),
        R(-0.030, (0.010, 0.000, 0.030), 0.092, 0.094, 0.098),
        R(0.060, (0.011, 0.002, -0.060), 0.095, 0.098, 0.100),
        R(0.170, (0.007, 0.000, -0.170), 0.083, 0.089, 0.085),
        R(0.300, (0.003, -0.002, -0.300), 0.069, 0.074, 0.068),
        R(0.400, (0, -0.004, -0.400), 0.058, 0.062, 0.057),
        R(K, (0, -0.004, -K), 0.056, 0.063, 0.054),
        R(0.520, (0, 0.000, -0.520), 0.057, 0.055, 0.064),
        R(0.600, (0, 0.006, -0.600), 0.060, 0.054, 0.080),
        R(0.690, (0, 0.004, -0.690), 0.051, 0.048, 0.062),
        R(0.790, (0, 0.000, -0.790), 0.041, 0.041, 0.043),
        R(0.870, (0, 0.000, -0.870), 0.036, 0.037, 0.038),
        R(0.930, (0, 0.000, -0.930), 0.035, 0.036, 0.037),
    ]
    leg = Loft(lr, xform=LEG_X, wfun=leg_w, n=2.2)
    leg.body(20, 32, mirror=True)
    # thigh: front plate with an overlapping hip lame, side plate, hamstring plate, holster pouch
    plate(leg, [(40, 0.060), (140, 0.075), (146, 0.300), (104, 0.385), (48, 0.345)], off=0.004, th=0.014,
          bulge=0.006, bevel=0.004, seg=2)
    plate(leg, [(34, -0.025), (128, -0.005), (124, 0.105), (40, 0.125)], off=0.021, th=0.010, bulge=0.003,
          bevel=0.003)
    plate(leg, [(-50, 0.050), (32, 0.050), (30, 0.310), (-44, 0.285)], off=0.004, th=0.012, bulge=0.004, bevel=0.0035)
    trim(leg, [(35.5, 0.135), (35.5, 0.33)], width=0.008, off=0.011, depth=0.008)
    plate(leg, [(-146, 0.10), (-58, 0.075), (-58, 0.29), (-142, 0.32)], off=0.003, th=0.010, bevel=0.003)
    plate(leg, rect(-40, -6, 0.150, 0.245, ct=4, cs=0.012), off=0.016, th=0.017, bevel=0.0035, res=0.014)
    trim(leg, [(-33, 0.168), (-13, 0.168)], width=0.005, off=0.0335, depth=0.004)
    # knee cap + chevron
    plate(leg, [(54, K - 0.053), (126, K - 0.053), (134, K + 0.004), (90, K + 0.072), (46, K + 0.004)], off=0.008,
          th=0.018, bulge=0.006, bevel=0.0042, seg=2)
    trim(leg, [(58, K + 0.032), (90, K + 0.088), (122, K + 0.032)], width=0.008, off=0.013, depth=0.008)
    # shin: main plate with an overlapping lower lame, calf plate
    plate(leg, [(38, 0.545), (142, 0.545), (138, 0.775), (90, 0.815), (42, 0.775)], off=0.005, th=0.014,
          bulge=0.005, bevel=0.004, seg=2)
    plate(leg, [(46, 0.765), (134, 0.765), (130, 0.855), (50, 0.855)], off=0.019, th=0.010, bulge=0.002, bevel=0.003)
    plate(leg, [(-150, 0.535), (-32, 0.535), (-40, 0.715), (-140, 0.715)], off=0.004, th=0.012, bulge=0.004,
          bevel=0.0035)
    trim(leg, [(31, 0.56), (31, 0.77)], width=0.008, off=0.011, depth=0.008)
    trim(leg, [(-26, 0.545), (-26, 0.705)], width=0.008, off=0.011, depth=0.008)
    trim(leg, [(-146, 0.725), (-36, 0.725)], width=0.008, off=0.010, depth=0.008)
    band(leg, 0.858, 0.905, off=0.008, th=0.011, res=0.014, bevel=0.003, mirror=True)

    # ---------------- boots (slightly smaller) --------------------------------------------------
    boot_w = chain(['foot.L', 'toe.L'], [0.175], 0.02)
    br = [
        R(0.000, (0, 0.086, -0.050), 0.020, 0.026, 0.020),
        R(0.020, (0, 0.074, -0.044), 0.050, 0.066, 0.060, nf=2.4, nb=5),
        R(0.070, (0, 0.024, -0.036), 0.056, 0.086, 0.068, nf=2.4, nb=5),
        R(0.130, (0, -0.036, -0.052), 0.057, 0.064, 0.052, nf=2.3, nb=5),
        R(0.190, (0, -0.098, -0.068), 0.054, 0.046, 0.036, nf=2.2, nb=4.5),
        R(0.240, (0, -0.150, -0.076), 0.047, 0.033, 0.028, nf=2.2, nb=4),
        R(0.265, (0, -0.176, -0.080), 0.031, 0.021, 0.022),
        R(0.276, (0, -0.184, -0.081), 0.006, 0.006, 0.006),
    ]
    boot = Loft(br, xform=FOOT_S, front=(0, 0, 1), side=(1, 0, 0), wfun=boot_w)
    boot.body(20, 20, mat=PLATE, mirror=True)
    plate(boot, [(28, 0.15), (152, 0.15), (150, 0.262), (30, 0.262)], off=0.002, th=0.010, bulge=0.003, bevel=0.003)
    plate(boot, [(-18, 0.03), (60, 0.03), (60, 0.14), (-18, 0.14)], off=0.003, th=0.009, bevel=0.003)
    plate(boot, [(120, 0.03), (198, 0.03), (198, 0.14), (120, 0.14)], off=0.003, th=0.009, bevel=0.003)
    trim(boot, [(-24, 0.028), (-24, 0.14), (-30, 0.258)], width=0.009, off=0.003, depth=0.008)
    trim(boot, [(204, 0.028), (204, 0.14), (210, 0.258)], width=0.009, off=0.003, depth=0.008)
    trim(boot, [(64, 0.05), (90, 0.155), (116, 0.05)], width=0.008, off=0.0095, depth=0.008)
    plate(boot, [(-70, 0.015), (-110, 0.015), (-110, 0.268), (-70, 0.268)], off=0.0, th=0.006, bevel=0.002)
    nz = Loft([R(0.00, (0, 0.070, -0.036), 0.020, 0.020, 0.020), R(0.02, (0, 0.090, -0.036), 0.027, 0.027, 0.027),
               R(0.036, (0, 0.106, -0.036), 0.029, 0.029, 0.029), R(0.042, (0, 0.112, -0.036), 0.025, 0.025, 0.025)],
              xform=FOOT_S, front=(0, 0, 1), side=(1, 0, 0), wfun=lambda s: {'foot.L': 1.0}, n=2.0)
    nz.body(18, 6, mat=PLATE, caps=(True, False), mirror=True)
    glow = Loft([R(0.0, (0, 0.102, -0.036), 0.021, 0.021, 0.021), R(0.006, (0, 0.108, -0.036), 0.021, 0.021, 0.021)],
                xform=FOOT_S, front=(0, 0, 1), side=(1, 0, 0), wfun=lambda s: {'foot.L': 1.0}, n=2.0)
    glow.body(18, 2, mat=TRIM, mirror=True)

    # ---------------- arms: tapered, deltoid/bicep/forearm definition --------------------------
    E, W = ARM_ELBOW, ARM_WRIST
    arm_w = chain(['shoulder.L', 'upper_arm.L', 'forearm.L', 'hand.L'], [0.0, E, W], [0.04, 0.035, 0.02])
    ar = [
        R(-0.060, (0, 0, 0.060), 0.048, 0.048, 0.048),
        R(0.000, (0, 0, 0.000), 0.074, 0.070, 0.070),
        R(0.050, (0.006, 0, -0.050), 0.075, 0.070, 0.067),
        R(0.130, (0.002, 0, -0.130), 0.063, 0.064, 0.059),
        R(0.250, (0, 0, -0.250), 0.048, 0.049, 0.046),
        R(E, (0, 0.002, -E), 0.046, 0.045, 0.049),
        R(0.370, (0, 0, -0.370), 0.054, 0.052, 0.052),
        R(0.480, (0, 0, -0.480), 0.044, 0.041, 0.041),
        R(W - 0.01, (0, 0, -(W - 0.01)), 0.034, 0.030, 0.030),
        R(W + 0.025, (0, 0, -(W + 0.025)), 0.029, 0.025, 0.025),
    ]
    arm = Loft(ar, xform=ARM_X, wfun=arm_w, n=2.2)
    arm.body(18, 28, mirror=True)
    plate(arm, rect(-60, 100, 0.100, 0.250, ct=12, cs=0.02, cut=(0, 0, 1, 1)), off=0.004, th=0.011, bulge=0.004,
          bevel=0.0032)
    trim(arm, [(-66, 0.115), (-66, 0.235)], width=0.007, off=0.008, depth=0.006)
    # elbow cap
    plate(arm, [(-134, E - 0.035), (-46, E - 0.035), (-54, E + 0.035), (-90, E + 0.052), (-126, E + 0.035)],
          off=0.005, th=0.015, bulge=0.004, bevel=0.0035, seg=2)
    # forearm: split main guards with an overlapping upper guard
    plate(arm, [(-122, 0.405), (-7, 0.400), (-7, W - 0.018), (-112, W - 0.022)], off=0.006, th=0.015, bulge=0.004,
          bevel=0.004)
    plate(arm, [(7, 0.400), (122, 0.405), (112, W - 0.022), (7, W - 0.018)], off=0.006, th=0.015, bulge=0.004,
          bevel=0.004)
    plate(arm, rect(-104, 104, E + 0.050, 0.425, ct=10, cs=0.012, cut=(0, 0, 1, 1)), off=0.019, th=0.010, bulge=0.003,
          bevel=0.003)
    trim(arm, [(0, 0.432), (0, W - 0.025)], width=0.008, off=0.013, depth=0.008)
    trim(arm, [(62, W - 0.045), (98, W - 0.045)], width=0.007, off=0.023, depth=0.006)
    band(arm, W - 0.015, W + 0.018, off=0.008, th=0.011, res=0.012, bevel=0.003, mirror=True)
    # pauldron: layered, flared lames with a glowing ridge
    pl = Loft([R(-0.115, (0.020, 0, 0.100), 0.040, 0.054, 0.054),
               R(-0.075, (0.018, 0, 0.062), 0.095, 0.099, 0.099),
               R(0.000, (0.017, 0, -0.008), 0.114, 0.107, 0.107),
               R(0.070, (0.021, 0, -0.074), 0.112, 0.101, 0.101),
               R(0.150, (0.026, 0, -0.150), 0.100, 0.090, 0.090)],
              xform=ARM_X, n=2.5, wfun=lambda s: {'upper_arm.L': 0.7, 'shoulder.L': 0.3})
    plate(pl, [(5, -0.101), (112, -0.082), (126, 0.030), (60, 0.046), (5, 0.050)], off=0.012, th=0.016, bulge=0.005,
          bevel=0.005, res=0.018, seg=2, closed=True)
    plate(pl, [(-5, -0.101), (-5, 0.050), (-60, 0.046), (-126, 0.030), (-112, -0.082)], off=0.012, th=0.016,
          bulge=0.005, bevel=0.005, res=0.018, seg=2, closed=True)
    trim(pl, [(0, -0.092), (0, 0.045)], width=0.011, off=0.020, depth=0.012)
    plate(pl, rect(-112, 112, 0.034, 0.092, ct=10, cs=0.016, cut=(0, 0, 1, 1)), off=0.003, th=0.013, bulge=0.003,
          bevel=0.004, res=0.018, closed=True)
    plate(pl, rect(-100, 100, 0.084, 0.140, ct=10, cs=0.016, cut=(0, 0, 1, 1)), off=-0.005, th=0.012, bulge=0.003,
          bevel=0.0035, res=0.018, closed=True)
    trim(pl, [(-92, 0.128), (92, 0.128)], width=0.007, off=0.0085, depth=0.008)

    # ---------------- hands (smaller armoured fists) -------------------------------------------
    hr = [
        R(-0.010, (0, 0, 0.010), 0.024, 0.030, 0.030, n=2.6),
        R(0.020, (0, -0.002, -0.020), 0.032, 0.046, 0.042, n=2.8),
        R(0.068, (-0.004, -0.004, -0.068), 0.037, 0.048, 0.045, n=3.0),
        R(0.100, (-0.006, -0.002, -0.100), 0.034, 0.042, 0.040, n=2.8),
        R(0.118, (-0.008, 0, -0.118), 0.016, 0.020, 0.020, n=2.4),
    ]
    hand = Loft(hr, xform=HAND_S, wfun=lambda s: {'hand.L': 1.0})
    hand.body(18, 14, mirror=True)
    plate(hand, rect(-65, 65, 0.012, 0.064, ct=12, cs=0.01), off=0.002, th=0.008, bulge=0.002, bevel=0.0025, res=0.014)
    plate(hand, rect(-72, 72, 0.070, 0.106, ct=10, cs=0.008), off=0.002, th=0.009, bulge=0.002, bevel=0.0025,
          res=0.014)
    trim(hand, [(-40, 0.066), (40, 0.066)], width=0.006, off=0.006, depth=0.006)
    thumb = Loft([R(0.0, (-0.012, -0.030, -0.018), 0.016, 0.016, 0.016), R(0.03, (-0.020, -0.046, -0.045), 0.015,
                  0.015, 0.015), R(0.055, (-0.026, -0.050, -0.068), 0.013, 0.013, 0.013),
                  R(0.065, (-0.028, -0.050, -0.076), 0.004, 0.004, 0.004)],
                 xform=HAND_S, front=(0, -1, 0), side=(1, 0, 0), wfun=lambda s: {'hand.L': 1.0})
    thumb.body(10, 6, mirror=True)

    # ---------------- helmet: aerodynamic, elongated to the back, forward-swept keel face -------
    head_w = lambda s: {'head': 1.0}
    hz = [
        R(1.652, (0, 0.004, 1.652), 0.050, 0.058, 0.046, nf=2.0, nb=2.2),
        R(1.672, (0, -0.006, 1.672), 0.078, 0.102, 0.070, nf=1.55, nb=2.2),
        R(1.705, (0, -0.002, 1.705), 0.092, 0.112, 0.090, nf=1.65, nb=2.3),
        R(1.750, (0, 0.004, 1.750), 0.097, 0.114, 0.108, nf=1.8, nb=2.3),
        R(1.795, (0, 0.012, 1.795), 0.097, 0.110, 0.128, nf=1.95, nb=2.3),
        R(1.835, (0, 0.020, 1.835), 0.090, 0.097, 0.136, nf=2.05, nb=2.2),
        R(1.863, (0, 0.026, 1.863), 0.073, 0.074, 0.120, nf=2.1, nb=2.2),
        R(1.881, (0, 0.028, 1.881), 0.049, 0.046, 0.086),
        R(1.891, (0, 0.030, 1.891), 0.023, 0.021, 0.042),
        R(1.895, (0, 0.030, 1.895), 0.004, 0.004, 0.006),
    ]
    helm = Loft(hz, wfun=head_w, n=2.2)
    helm.body(40, 26, mat=PLATE)
    visor = [(36, 1.790), (50, 1.745), (90, 1.722), (130, 1.745), (144, 1.790), (128, 1.803), (90, 1.786), (52, 1.803)]
    plate(helm, visor, off=0.001, th=0.006, mat=VISOR, bevel=0.002, mirror=False, res=0.01)
    # V / arrow visor slit
    trim(helm, [(48, 1.797), (69, 1.780), (90, 1.757), (111, 1.780), (132, 1.797)], width=0.0105, off=0.0085,
         depth=0.007, mirror=False, res=0.007)
    # sharp swept brow, V-pointed toward the nose line
    plate(helm, [(26, 1.806), (52, 1.806), (88.5, 1.786), (88.5, 1.838), (60, 1.846), (24, 1.832)], off=0.001,
          th=0.011, bulge=0.002, bevel=0.0025, res=0.012)
    plate(helm, rect(85.5, 94.5, 1.842, 1.878, ct=2, cs=0.01), off=0.001, th=0.008, bevel=0.002, mirror=False,
          res=0.01)
    # cheek / jaw plates meeting on the keel, with vent lines
    plate(helm, [(20, 1.662), (62, 1.668), (88.5, 1.688), (88.5, 1.716), (52, 1.738), (36, 1.782), (18, 1.758)],
          off=0.001, th=0.010, bevel=0.0025, res=0.012)
    trim(helm, [(46, 1.698), (78, 1.705)], width=0.005, off=0.0115, depth=0.005, res=0.008)
    # ear pods + rear crest fin (continues the spine line from behind)
    plate(helm, ngon(2, 1.768, 14, 0.028), off=0.001, th=0.010, bulge=0.003, bevel=0.003, res=0.01)
    trim(helm, [(-8, 1.752), (2, 1.786), (12, 1.752)], width=0.005, off=0.0115, depth=0.005, res=0.008)
    plate(helm, rect(-102, -78, 1.700, 1.872, ct=5, cs=0.02), off=0.001, th=0.010, bevel=0.003, mirror=False, res=0.012)
    trim(helm, [(-90, 1.708), (-90, 1.862)], width=0.012, off=0.0115, depth=0.008, mirror=False)


# ----------------------------------------------------------------------------------------------
# Scene objects


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_materials():
    spec = {
        'Suit': dict(base=(0.0045, 0.005, 0.0065), metal=0.08, rough=0.74),
        'Plate': dict(base=(0.014, 0.0155, 0.02), metal=0.55, rough=0.34),
        'Trim': dict(base=(0.0, 0.0, 0.0), metal=0.0, rough=0.6, emit=(1.0, 1.0, 1.0)),
        'Visor': dict(base=(0.015, 0.02, 0.03), metal=1.0, rough=0.07),
    }
    mats = []
    for name in MAT_NAMES:
        s = spec[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.use_backface_culling = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*s['base'], 1)
        bsdf.inputs['Metallic'].default_value = s['metal']
        bsdf.inputs['Roughness'].default_value = s['rough']
        if 'emit' in s:
            bsdf.inputs['Emission Color'].default_value = (*s['emit'], 1)
            bsdf.inputs['Emission Strength'].default_value = 1.0
        mats.append(m)
    return mats


BONES = [
    # name, head, tail, parent, roll-up vector
    ('root', (0, 0, 0), (0, -0.25, 0), None, (0, 0, 1)),
    ('hips', (0, 0, 0.975), (0, 0, 1.10), 'root', (0, -1, 0)),
    ('spine', (0, 0, 1.10), (0, 0, 1.287), 'hips', (0, -1, 0)),
    ('chest', (0, 0, 1.287), (0, 0, 1.54), 'spine', (0, -1, 0)),
    ('neck', (0, 0, 1.575), (0, 0, 1.662), 'chest', (0, -1, 0)),
    ('head', (0, 0, 1.662), (0, 0, 1.89), 'neck', (0, -1, 0)),
]


def side_bones():
    L = [
        ('shoulder.L', (0.03, 0.0, 1.50), tuple(SHO_J), 'chest', (0, -1, 0)),
        ('upper_arm.L', tuple(SHO_J), tuple(ELBOW), 'shoulder.L', (0, -1, 0)),
        ('forearm.L', tuple(ELBOW), tuple(WRIST), 'upper_arm.L', (0, -1, 0)),
        ('hand.L', tuple(WRIST), tuple(HAND_S @ Vector((0, 0, -0.1))), 'forearm.L', (0, -1, 0)),
        ('thigh.L', tuple(HIP_J), tuple(KNEE), 'hips', (0, -1, 0)),
        ('shin.L', tuple(KNEE), tuple(ANKLE), 'thigh.L', (0, -1, 0)),
        ('foot.L', tuple(ANKLE), tuple(BALL), 'shin.L', (0, 0, 1)),
        ('toe.L', tuple(BALL), tuple(TOE), 'foot.L', (0, 0, 1)),
    ]
    out = []
    for n, h, t, p, up in L:
        out.append((n, h, t, p, up))
        mh = (-h[0], h[1], h[2])
        mt = (-t[0], t[1], t[2])
        out.append((mirror_name(n), mh, mt, mirror_name(p) if p else None, up))
    return out


def make_armature():
    data = bpy.data.armatures.new('RunnerRig')
    obj = bpy.data.objects.new('Runner', data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent, up in BONES + side_bones():
        eb = data.edit_bones.new(name)
        lift = Vector() if name == 'root' else UP
        eb.head = Vector(h) + lift
        eb.tail = Vector(t) + lift
        eb.align_roll(Vector(up))
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def make_mesh(arm, mats):
    me = bpy.data.meshes.new('RunnerMesh')
    me.from_pydata([tuple(v + UP) for v in GEO.v], [], GEO.f)
    me.update()
    for m in mats:
        me.materials.append(m)
    me.polygons.foreach_set('material_index', GEO.m)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    obj = bpy.data.objects.new('RunnerBody', me)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for i, w in enumerate(GEO.w):
        tot = sum(w.values()) or 1.0
        for b, val in w.items():
            g = groups.get(b)
            if g is None:
                g = groups[b] = obj.vertex_groups.new(name=b)
            g.add([i], val / tot, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    wn = obj.modifiers.new('wn', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 50
    wn.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier='wn')
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return obj


def bake_ao(obj):
    """Cycles ambient occlusion baked into a vertex colour (COLOR_0): darkens the seams between plates and
    undersuit so the armour reads layered even without screen-space AO at runtime."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new('BakeWorld')
    sc.world.light_settings.distance = 0.14
    me = obj.data
    attr = me.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    me.attributes.render_color_index = me.color_attributes.active_color_index
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True, margin=0)
    vals = [0.0] * (len(me.vertices) * 4)
    attr.data.foreach_get('color', vals)
    for i in range(0, len(vals), 4):
        a = 0.42 + 0.58 * (min(1.0, max(0.0, vals[i])) ** 0.85)
        vals[i] = vals[i + 1] = vals[i + 2] = a
        vals[i + 3] = 1.0
    attr.data.foreach_set('color', vals)


def make_markers(arm):
    bpy.context.view_layer.update()
    thr = Vector((0, 0.118 * FOOT_SCALE.y, -0.036 * FOOT_SCALE.z))
    specs = [('thruster.L', 'foot.L', ANKLE + thr + UP),
             ('thruster.R', 'foot.R', Vector((-ANKLE.x, ANKLE.y + thr.y, ANKLE.z + thr.z)) + UP),
             ('core.back', 'chest', Vector((0, 0.165, 1.36)) + UP),
             ('core.front', 'chest', Vector((0, -0.168, 1.44)) + UP)]
    for name, bone, pos in specs:
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.03
        bpy.context.scene.collection.objects.link(e)
        e.parent = arm
        e.parent_type = 'BONE'
        e.parent_bone = bone
        bpy.context.view_layer.update()
        e.matrix_world = Matrix.Translation(pos)


# ----------------------------------------------------------------------------------------------
# Animation


def qarm(rx, ry, rz):
    return (Quaternion((0, 0, 1), math.radians(rz)) @ Quaternion((1, 0, 0), math.radians(rx))
            @ Quaternion((0, 1, 0), math.radians(ry)))


CONTACTS = {
    # bone -> rest-space points that may touch the ground
    'foot.L': [ANKLE + UP + Vector((0, 0.074, -SOLE)), ANKLE + UP + Vector((0.038, -0.028, -SOLE)),
               ANKLE + UP + Vector((-0.038, -0.028, -SOLE))],
    'toe.L': [ANKLE + UP + Vector((0, -0.157, -0.096))],
    'shin.L': [KNEE + UP + Vector((0, -0.075, 0.0))],
}


def contact_min(arm):
    mz = 1e9
    for bone, pts in CONTACTS.items():
        for side in ('L', 'R'):
            name = bone[:-1] + side
            pb = arm.pose.bones[name]
            M = pb.matrix @ pb.bone.matrix_local.inverted()
            for p in pts:
                q = Vector((p.x if side == 'L' else -p.x, p.y, p.z))
                mz = min(mz, (M @ q).z)
    return mz


def apply_pose(arm, pose):
    """pose: {bone: (rx, ry, rz)} in rest-armature axes (left-side values; '.R' entries given explicitly)."""
    for pb in arm.pose.bones:
        rot = pose.get(pb.name)
        R = pb.bone.matrix_local.to_quaternion()
        q = qarm(*rot) if rot else Quaternion()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = R.inverted() @ q @ R
        pb.location = (0, 0, 0)


def set_hips(arm, loc):
    pb = arm.pose.bones['hips']
    R = pb.bone.matrix_local.to_quaternion()
    pb.location = R.inverted() @ Vector(loc)


def bake(arm, name, frames, fn, loop=True, ground=True, air=None):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    prev = {}
    last = frames if loop else frames
    for f in range(last + 1):
        p = (f / frames) % 1.0 if loop else f / frames
        pose, hips = fn(p)
        apply_pose(arm, pose)
        set_hips(arm, (hips[0], hips[1], 0))
        bpy.context.view_layer.update()
        z = hips[2]
        if ground:
            z += -contact_min(arm) + (air(p) if air else 0.0)
        set_hips(arm, (hips[0], hips[1], z))
        for pb in arm.pose.bones:
            q = pb.rotation_quaternion.copy()
            if pb.name in prev and prev[pb.name].dot(q) < 0:
                q.negate()
                pb.rotation_quaternion = q
            prev[pb.name] = q
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            if pb.name == 'hips':
                pb.keyframe_insert('location', frame=f, group=pb.name)
    # push into an NLA track so every action is exported under its own name
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    track.mute = True
    arm.animation_data.action = None
    return act


def mirror_pose(side_pose):
    """side_pose: {'thigh': (..), ...} for L and R dicts -> full bone dict."""
    out = {}
    for side, d in side_pose.items():
        for bone, (rx, ry, rz) in d.items():
            if side == 'L':
                out[bone + '.L'] = (rx, ry, rz)
            else:
                out[bone + '.R'] = (rx, -ry, -rz)
    return out


THIGH = [(0.0, -30), (0.12, -8), (0.32, 24), (0.42, 20), (0.6, -22), (0.8, -58), (0.92, -44)]
SHIN = [(0.0, 14), (0.1, 30), (0.25, 20), (0.38, 36), (0.55, 112), (0.68, 122), (0.82, 72), (0.93, 24)]
FOOTW = [(0.0, -6), (0.12, 0), (0.28, 12), (0.4, 42), (0.55, 58), (0.72, 20), (0.9, -8)]
TOEK = [(0.0, 0), (0.25, -10), (0.36, -30), (0.46, -6), (0.6, 0), (0.9, 0)]
UARM = [(0.05, -12), (0.3, -66), (0.55, 4), (0.8, 46)]
FARM = [(0.05, -96), (0.3, -118), (0.55, -84), (0.8, -70)]


def run_pose(p, sprint=0.0):
    k = 1.0 + 0.18 * sprint
    hips_x = 9 + 6 * sprint
    spine_x = 7 + 4 * sprint
    chest_x = 5 + 4 * sprint
    yaw = math.cos(2 * math.pi * (p - 0.8))
    roll = math.cos(2 * math.pi * (p - 0.18))
    hips = (0, 0, 0)
    pose = {
        'hips': (hips_x, -3.5 * roll, -9 * yaw * k),
        'spine': (spine_x, 2 * roll, 5 * yaw * k),
        'chest': (chest_x, 1 * roll, 8 * yaw * k),
    }
    torso_x = hips_x + spine_x + chest_x
    pose['neck'] = (-8 - 2 * sprint, 0, -3 * yaw)
    pose['head'] = (8 - torso_x + 8 + 2 * sprint, 0, -6 * yaw)
    sides = {}
    for side, ph in (('L', p), ('R', (p + 0.5) % 1.0)):
        th = periodic(THIGH, ph)
        if th < 0:
            th *= k
        sh = periodic(SHIN, ph) * (1 + 0.08 * sprint)
        fw = periodic(FOOTW, ph)
        ua = periodic(UARM, ph) * k
        fa = periodic(FARM, ph)
        fwd = max(0.0, -ua) / 66.0
        back = max(0.0, ua) / 46.0
        sides[side] = {
            'thigh': (th - hips_x, 2, 3),
            'shin': (sh, 0, 0),
            'foot': (fw - (th + sh), -1, 0),
            'toe': (periodic(TOEK, ph), 0, 0),
            'shoulder': (0, -2 * fwd, -6 * fwd + 4 * back),
            'upper_arm': (ua, 27 - 6 * back, -14 * fwd),
            'forearm': (fa, 0, 0),
            'hand': (-8, 0, 6),
        }
    pose.update(mirror_pose(sides))
    return pose, hips


def run_air(p, amt=0.028):
    q = (p * 2) % 1.0
    return amt * max(0.0, math.sin(math.pi * (q - 0.72) / 0.36)) if 0.72 <= q <= 1.08 or q < 0.08 else 0.0


def idle_pose(p):
    b = math.sin(2 * math.pi * p)
    sw = math.sin(2 * math.pi * p + 0.6)
    pose = {
        'hips': (0.5, 1.0 * sw, 0),
        'spine': (-1.2 + 0.6 * b, -0.6 * sw, 0),
        'chest': (-1.5 + 1.2 * b, -0.3 * sw, 0),
        'neck': (4, 0, 2 * math.sin(2 * math.pi * p * 1)),
        'head': (2 - 0.6 * b, 0, 3 * math.sin(2 * math.pi * p)),
    }
    sides = {}
    for side, sg in (('L', 1), ('R', -1)):
        sides[side] = {
            'thigh': (-1, -6, 7),
            'shin': (4, 0, 0),
            'foot': (-3 + 2, 6, -4),
            'shoulder': (0, -1.5 * b, 0),
            'upper_arm': (5 + 1.5 * b, 23 - 1.2 * b, 8),
            'forearm': (-20 - 2 * b, 0, 0),
            'hand': (-10, 0, 12),
        }
    pose.update(mirror_pose(sides))
    return pose, (0, 0, 0)


def strafe_pose(direction):
    """Additive-style lean: frame 0 is the rest pose (reference), then the lean delta is held.
    direction +1 = toward his left (+X in Blender), -1 = toward his right."""
    def fn(p):
        if p <= 0.0:
            return {}, (0, 0, 0)
        t = smooth(p / 0.45)
        d = direction
        pose = {
            'hips': (0, 5 * d * t, 7 * d * t),
            'spine': (0, 5 * d * t, 3 * d * t),
            'chest': (0, 6 * d * t, 5 * d * t),
            'head': (0, -8 * d * t, -4 * d * t),
        }
        outer, inner = ('R', 'L') if d > 0 else ('L', 'R')
        sides = {
            outer: {'upper_arm': (0, -14 * t, 0), 'thigh': (0, -6 * t, 0)},
            inner: {'upper_arm': (0, 6 * t, 0), 'thigh': (0, 4 * t, 0)},
        }
        pose.update(mirror_pose(sides))
        return pose, (0, 0, 0)
    return fn


def lerp_pose(a, b, t):
    out = {}
    for k in set(a) | set(b):
        va = a.get(k, (0, 0, 0))
        vb = b.get(k, (0, 0, 0))
        out[k] = tuple(x + (y - x) * t for x, y in zip(va, vb))
    return out


def keyed(keys):
    """keys: [(t, pose, hips)] non-periodic; smoothstep blend between neighbours."""
    def fn(p):
        for (t0, a, ha), (t1, b, hb) in zip(keys, keys[1:]):
            if p <= t1:
                u = smooth((p - t0) / (t1 - t0))
                return lerp_pose(a, b, u), tuple(x + (y - x) * u for x, y in zip(ha, hb))
        return keys[-1][1], keys[-1][2]
    return fn


def fall_keys():
    start, _ = run_pose(0.18)
    hit = dict(start)
    hit.update({'hips': (-12, 0, 6), 'spine': (-16, 3, 4), 'chest': (-14, 2, 6), 'neck': (-10, 0, 0),
                'head': (-22, 4, 8)})
    hit.update(mirror_pose({
        'L': {'thigh': (-26, -4, 0), 'shin': (36, 0, 0), 'foot': (-10, 0, 0), 'upper_arm': (-50, -8, -10),
              'forearm': (-40, 0, 0), 'hand': (-20, 0, 0)},
        'R': {'thigh': (14, -2, 0), 'shin': (70, 0, 0), 'foot': (10, 0, 0), 'upper_arm': (-30, -18, 0),
              'forearm': (-60, 0, 0), 'hand': (-20, 0, 0)}}))
    buckle = {'hips': (18, -4, -4), 'spine': (16, -3, -3), 'chest': (14, -2, -4), 'neck': (8, 0, 0),
              'head': (6, -4, -6)}
    buckle.update(mirror_pose({
        'L': {'thigh': (-86, -6, 4), 'shin': (122, 0, 0), 'foot': (18, 0, 0), 'upper_arm': (-62, 18, -12),
              'forearm': (-70, 0, 0), 'hand': (-10, 0, 0)},
        'R': {'thigh': (-60, -6, 4), 'shin': (112, 0, 0), 'foot': (30, 0, 0), 'upper_arm': (-48, 22, -8),
              'forearm': (-64, 0, 0), 'hand': (-10, 0, 0)}}))
    kneel = {'hips': (16, -3, -6), 'spine': (22, -2, -4), 'chest': (20, -2, -4), 'neck': (14, 0, 0),
             'head': (18, -6, -10)}
    kneel.update(mirror_pose({
        'L': {'thigh': (-26, -8, 6), 'shin': (112, 0, 0), 'foot': (40, 0, 0), 'toe': (-20, 0, 0),
              'shoulder': (0, 4, -4), 'upper_arm': (-40, 30, -18), 'forearm': (-44, 0, 0), 'hand': (-16, 0, 10)},
        'R': {'thigh': (-14, -10, 6), 'shin': (108, 0, 0), 'foot': (48, 0, 0), 'toe': (-18, 0, 0),
              'shoulder': (0, 5, -4), 'upper_arm': (-22, 28, -10), 'forearm': (-36, 0, 0), 'hand': (-16, 0, 10)}}))
    settle = lerp_pose(kneel, {'spine': (28, -2, -4), 'chest': (26, -2, -4), 'neck': (18, 0, 0),
                               'head': (22, -6, -12)}, 0.0)
    settle.update({'spine': (27, -2, -4), 'chest': (24, -2, -4), 'neck': (18, 0, 0), 'head': (22, -6, -12)})
    return [(0.0, start, (0, 0.0, 0)), (0.13, hit, (0, 0.06, 0.0)), (0.4, buckle, (0, 0.03, 0)),
            (0.68, kneel, (0, -0.02, 0)), (1.0, settle, (0, -0.02, 0))]


def victory_keys():
    start, _ = run_pose(0.18)
    crouch = {'hips': (8, 0, 0), 'spine': (10, 0, 0), 'chest': (8, 0, 0), 'neck': (2, 0, 0), 'head': (0, 0, 0)}
    crouch.update(mirror_pose({
        'L': {'thigh': (-30, -8, 6), 'shin': (48, 0, 0), 'foot': (-18, 6, 0), 'upper_arm': (-10, 22, 0),
              'forearm': (-90, 0, 0), 'hand': (-10, 0, 0)},
        'R': {'thigh': (-26, -8, 6), 'shin': (44, 0, 0), 'foot': (-18, 6, 0), 'upper_arm': (-30, 18, 0),
              'forearm': (-110, 0, 0), 'hand': (-10, 0, 0)}}))
    pump = {'hips': (-3, 2, 4), 'spine': (-7, 2, 4), 'chest': (-8, 3, 6), 'neck': (-4, 0, 0), 'head': (-12, -4, -6)}
    pump.update(mirror_pose({
        'L': {'thigh': (-4, -9, 8), 'shin': (6, 0, 0), 'foot': (-2, 8, -4), 'shoulder': (0, 2, 0),
              'upper_arm': (8, 16, 14), 'forearm': (-96, 0, 0), 'hand': (-18, 0, 12)},
        'R': {'thigh': (-12, -10, 6), 'shin': (18, 0, 0), 'foot': (-6, 10, -4), 'shoulder': (0, -10, -6),
              'upper_arm': (-166, 18, 0), 'forearm': (-24, 0, 0), 'hand': (-12, 0, 0)}}))
    hold = dict(pump)
    hold.update({'chest': (-9, 3, 6), 'head': (-13, -4, -6)})
    return [(0.0, start, (0, 0, 0)), (0.28, crouch, (0, 0, 0)), (0.55, pump, (0, 0, 0)), (1.0, hold, (0, 0, 0))]


def make_animations(arm):
    bpy.context.scene.render.fps = 30
    bake(arm, 'Run', 24, lambda p: run_pose(p, 0.0), air=lambda p: run_air(p, 0.028))
    bake(arm, 'Sprint', 20, lambda p: run_pose(p, 1.0), air=lambda p: run_air(p, 0.04))
    bake(arm, 'Idle', 90, idle_pose)
    bake(arm, 'StrafeL', 8, strafe_pose(1), loop=False, ground=False)
    bake(arm, 'StrafeR', 8, strafe_pose(-1), loop=False, ground=False)
    bake(arm, 'Fall', 30, keyed(fall_keys()), loop=False,
         air=lambda p: 0.05 * math.sin(math.pi * min(1.0, p / 0.3)) if p < 0.3 else 0.0)
    bake(arm, 'Victory', 36, keyed(victory_keys()), loop=False)


# ----------------------------------------------------------------------------------------------
# Export + previews


def export(arm):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        o.select_set(True)
    arm.rotation_euler = (0, 0, math.pi)
    bpy.context.view_layer.update()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
        export_animation_mode='NLA_TRACKS', export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_vertex_color='ACTIVE', export_skins=True, export_def_bones=False,
        export_yup=True, export_apply=False, export_force_sampling=True, export_optimize_animation_size=False,
        export_reset_pose_bones=True, export_lights=False, export_cameras=False, export_extras=False)
    arm.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    print('EXPORTED', OUT, os.path.getsize(OUT))


def preview_materials():
    """Cycles look matching the runtime materials: near-black satin plates, matte black undersuit."""
    look = {'Suit': ((0.0045, 0.005, 0.0065), 0.08, 0.74), 'Plate': ((0.014, 0.0155, 0.02), 0.55, 0.34),
            'Visor': ((0.004, 0.005, 0.008), 1.0, 0.05)}
    for m in bpy.data.materials:
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF') if nt else None
        if not b:
            continue
        if m.name == 'Trim':
            b.inputs['Emission Color'].default_value = (1.0, 0.40, 0.05, 1)
            b.inputs['Emission Strength'].default_value = 9.0
        elif m.name in look:
            c, me, ro = look[m.name]
            b.inputs['Base Color'].default_value = (*c, 1)
            b.inputs['Metallic'].default_value = me
            b.inputs['Roughness'].default_value = ro
            if m.name == 'Plate':
                # roughness breakup, same idea as the runtime shader patch
                tc = nt.nodes.new('ShaderNodeTexCoord')
                nz = nt.nodes.new('ShaderNodeTexNoise')
                nz.inputs['Scale'].default_value = 9.0
                nz.inputs['Detail'].default_value = 3.0
                mr = nt.nodes.new('ShaderNodeMapRange')
                mr.inputs['To Min'].default_value = ro - 0.1
                mr.inputs['To Max'].default_value = ro + 0.12
                nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
                nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
                nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])


def render_previews(arm):
    sc = bpy.context.scene
    preview_materials()
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = int(arg('--samples', '24'))
    sc.cycles.use_denoising = True
    sc.render.resolution_x = int(arg('--rw', '560'))
    sc.render.resolution_y = int(arg('--rh', '840'))
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.012, 0.03, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.world = world

    def light(name, kind, loc, energy, color, size=1.0, target=(0, 0, 1.0)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        o = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(o)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o

    rig = bpy.data.objects.new('LightRig', None)
    sc.collection.objects.link(rig)
    for o in [light('key', 'AREA', (2.0, -3.0, 3.0), 380, (1, 0.97, 0.92), 2.0),
              light('rimL', 'AREA', (-2.6, 2.4, 2.4), 1100, (0.6, 0.35, 1.0), 1.2),
              light('rimR', 'AREA', (2.6, 2.4, 2.0), 850, (0.3, 0.8, 1.0), 1.2),
              light('fill', 'AREA', (-2.5, -2.5, 1.0), 110, (0.5, 0.6, 1.0), 3.0),
              light('top', 'AREA', (0, 0.5, 4.0), 150, (0.8, 0.85, 1.0), 2.0)]:
        o.parent = rig
    bpy.ops.mesh.primitive_plane_add(size=30)
    floor = bpy.context.active_object
    fm = bpy.data.materials.new('Floor')
    fm.use_nodes = True
    fb = fm.node_tree.nodes['Principled BSDF']
    fb.inputs['Base Color'].default_value = (0.02, 0.022, 0.04, 1)
    fb.inputs['Roughness'].default_value = 0.35
    fb.inputs['Metallic'].default_value = 0.4
    floor.data.materials.append(fm)

    cam_d = bpy.data.cameras.new('Cam')
    cam_d.lens = 60
    cam = bpy.data.objects.new('Cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam

    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    rl = nt.nodes.new('CompositorNodeRLayers')
    gl = nt.nodes.new('CompositorNodeGlare')
    gl.glare_type = 'FOG_GLOW'
    gl.quality = 'MEDIUM'
    gl.threshold = 1.0
    gl.size = 7
    comp = nt.nodes.new('CompositorNodeComposite')
    nt.links.new(rl.outputs['Image'], gl.inputs['Image'])
    nt.links.new(gl.outputs['Image'], comp.inputs['Image'])

    def shot(fname, yaw_deg, action=None, frame=0, dist=4.1, height=1.0, target=0.95, lens=60):
        arm.animation_data.action = bpy.data.actions[action] if action else None
        if not action:
            for pb in arm.pose.bones:
                pb.rotation_quaternion = Quaternion()
                pb.location = (0, 0, 0)
        sc.frame_set(frame)
        a = math.radians(yaw_deg)
        cam.location = (math.sin(a) * dist, -math.cos(a) * dist, height)
        d = Vector((0, 0, target)) - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cam_d.lens = lens
        rig.rotation_euler = (0, 0, a)
        sc.render.filepath = os.path.join(RENDER, fname)
        bpy.ops.render.render(write_still=True)
        print('RENDERED', sc.render.filepath)

    shots = {
        'front': lambda: shot('front.png', 0, 'Idle', 0),
        'back': lambda: shot('back.png', 180, 'Idle', 0),
        'q34': lambda: shot('q34.png', 35, 'Idle', 20),
        'q34back': lambda: shot('q34back.png', 150, 'Run', 6, height=1.6, target=0.9),
        'rest': lambda: shot('rest.png', 25),
        'run0': lambda: shot('run0.png', 90, 'Run', 0),
        'run6': lambda: shot('run6.png', 90, 'Run', 6),
        'run12': lambda: shot('run12.png', 90, 'Run', 12),
        'run18': lambda: shot('run18.png', 90, 'Run', 18),
        'runback': lambda: shot('runback.png', 180, 'Run', 3, dist=6.4, height=3.0, target=1.0, lens=45),
        'sprint': lambda: shot('sprint.png', 70, 'Sprint', 5),
        'fall': lambda: shot('fall.png', 60, 'Fall', 30),
        'victory': lambda: shot('victory.png', 20, 'Victory', 36),
        'head': lambda: shot('head.png', 30, 'Idle', 0, dist=1.6, height=1.75, target=1.76),
        'headside': lambda: shot('headside.png', 90, 'Idle', 0, dist=1.2, height=1.8, target=1.8),
        'side': lambda: shot('side.png', 90, 'Idle', 0),
        'headback': lambda: shot('headback.png', 160, 'Idle', 0, dist=2.2, height=1.6, target=1.5),
    }
    names = RENDER_ONLY.split(',') if RENDER_ONLY else list(shots)
    for n in names:
        shots[n]()


def main():
    reset()
    build()
    mats = make_materials()
    arm = make_armature()
    body = make_mesh(arm, mats)
    make_markers(arm)
    if '--no-ao' not in ARGV:
        bake_ao(body)
    tris = sum(len(f) - 2 for f in GEO.f)
    print('TRIS', tris, 'VERTS', len(GEO.v))
    make_animations(arm)
    if '--no-export' not in ARGV:
        export(arm)
    if RENDER:
        os.makedirs(RENDER, exist_ok=True)
        render_previews(arm)


main()
