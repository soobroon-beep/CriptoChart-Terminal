#!/usr/bin/env python3
"""Regenera los iconos de la app (i01…i34) a partir de los originales de 512 px.
 - quita el reborde gris claro que traen los originales en la orilla (se ve como una "orilla blanca"),
 - el icono 'any' llena todo el lienzo,
 - el 'maskable' (el que usan la app instalada y la pantalla de inicio) llena el lienzo en lugar del 79 % anterior,
 - el de 180 px (iPhone) sale opaco y sin esquinas transparentes.
Uso: python3 tools-gen-icons.py <carpeta con los i??-512.png originales> <carpeta icons de salida>"""
import sys, os, numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt, gaussian_filter
SRC, OUT = sys.argv[1], sys.argv[2]
M = 8  # píxeles (de 512) que se recortan de la orilla: ahí vive el reborde claro

def tile(img):
    a = np.array(img.convert('RGBA')); S = 2
    big = Image.fromarray(a).resize((512 * S, 512 * S), Image.LANCZOS); b = np.array(big)
    solid = np.array(Image.fromarray(a[..., 3]).resize((512 * S, 512 * S), Image.BILINEAR)) > 128
    mask = distance_transform_edt(np.pad(solid, 1))[1:-1, 1:-1] >= M * S  # con borde de ceros: los lados que tocan el lienzo también se recortan
    ys, xs = np.where(mask); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = max(x1 - x0, y1 - y0); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    soft = gaussian_filter(mask.astype(float), 1.4)
    rgb = Image.fromarray(b[..., :3]); al = Image.fromarray((soft * 255).astype(np.uint8))
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    rgba = Image.merge('RGBA', (*rgb.crop(box).split(), al.crop(box)))
    return rgba.resize((1024, 1024), Image.LANCZOS)  # el icono recortado llena el lienzo

def fill_corners(t):  # color de relleno para las esquinas transparentes: el propio dibujo, muy difuminado
    a = np.array(t).astype(float); w = a[..., 3:4] / 255
    num = gaussian_filter(a[..., :3] * w, (60, 60, 0)); den = gaussian_filter(w, (60, 60, 0)) + 1e-6
    return Image.fromarray((num / den).clip(0, 255).astype(np.uint8))

for n in range(1, 35):
    k = 'i%02d' % n; t = tile(Image.open(f'{SRC}/{k}-512.png'))
    t.resize((512, 512), Image.LANCZOS).save(f'{OUT}/{k}-512.png', optimize=True)
    t.resize((192, 192), Image.LANCZOS).save(f'{OUT}/{k}-192.png', optimize=True)
    bg = fill_corners(t).convert('RGBA'); bg.alpha_composite(t.resize((1086, 1086), Image.LANCZOS).crop((31, 31, 1055, 1055)))  # maskable: opaco, el icono llena el lienzo (algo más grande que el lienzo para que no se note el borde)
    bg.convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{OUT}/{k}-maskable-512.png', optimize=True)
    ins = 74  # (de 1024) fuera de las esquinas redondeadas: cuadrado opaco para iOS, que pone su propia máscara
    t.crop((ins, ins, 1024 - ins, 1024 - ins)).convert('RGB').resize((180, 180), Image.LANCZOS).save(f'{OUT}/{k}-180.png', optimize=True)
print('ok')

# Marca VORTEX solo en blanco y sin fondo (PNG con transparencia) para el logo sobre el gráfico: se saca del icono blanco y negro (i02)
a = np.array(Image.open(f'{OUT}/i02-512.png').convert('RGBA')).astype(float)
lum = a[..., :3].mean(axis=2); alpha = np.clip((lum - 70) / (225 - 70), 0, 1) * (a[..., 3] / 255)
alpha = alpha[10:-10, 10:-10]; ys, xs = np.where(alpha > .04); pad = 10
x0, x1, y0, y1 = max(xs.min() - pad, 0), min(xs.max() + pad, alpha.shape[1]), max(ys.min() - pad, 0), min(ys.max() + pad, alpha.shape[0])
al = (alpha[y0:y1, x0:x1] * 255).astype(np.uint8); h, w = al.shape; side = max(h, w)
canvas = np.zeros((side, side), np.uint8); canvas[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = al
m = Image.fromarray(canvas).resize((256, 256), Image.LANCZOS)
Image.merge('RGBA', (*Image.new('RGB', (256, 256), (255, 255, 255)).split(), m)).save(f'{OUT}/vortex-mark.png', optimize=True)

# La estrella sola (misma lienzo de 256 px) para el destello de la animación del logo
from scipy.ndimage import label, binary_dilation
mk = np.array(Image.open(f'{OUT}/vortex-mark.png')); lab, _ = label(mk[..., 3] > 30)
mk[..., 3] = np.where(binary_dilation(lab == 1, iterations=4), mk[..., 3], 0)
Image.fromarray(mk).save(f'{OUT}/vortex-star.png', optimize=True)
