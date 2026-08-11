#!/usr/bin/env python3
"""Real face detection for Story Studio QA — OpenCV Haar cascades (offline).

Produces normalized face boxes {x,y,w,h in 0..1} per image, the same shape the
production pipeline (AWS Rekognition -> image_faces.bounding_box) feeds the
planner. This is a genuine detector run on the actual photos, not invented data.
Wide/room shots yield few small detections; people shots yield larger ones — the
signal the planner uses to frame faces and to tell people-beats from room-beats.

Usage: python3 scripts/detect-faces.py <src_dir> <out.json>
"""
import sys, os, json, glob
import cv2

src_dir = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qa-event-src"
out_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/qa-event-faces.json"

cdir = cv2.data.haarcascades
frontal = cv2.CascadeClassifier(cdir + "haarcascade_frontalface_alt2.xml")
profile = cv2.CascadeClassifier(cdir + "haarcascade_profileface.xml")

def iou(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    x1 = max(ax, bx); y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw); y2 = min(ay + ah, by + bh)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    if inter <= 0: return 0.0
    return inter / float(aw * ah + bw * bh - inter)

def dedupe(dets):
    dets = sorted(dets, key=lambda d: d[2] * d[3], reverse=True)
    kept = []
    for d in dets:
        if all(iou(d, k) < 0.3 for k in kept):
            kept.append(d)
    return kept

files = sorted(glob.glob(os.path.join(src_dir, "*.jpg")),
               key=lambda p: (int(''.join(c for c in os.path.basename(p) if c.isdigit()) or 0), p))
result = {}
for f in files:
    img = cv2.imread(f)
    if img is None:
        continue
    h, w = img.shape[:2]
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    minsz = max(18, int(min(w, h) * 0.018))  # faces at least ~1.8% of the short edge
    dets = []
    for cas in (frontal, profile):
        found = cas.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=6, minSize=(minsz, minsz))
        dets.extend([tuple(int(v) for v in r) for r in found])
    # profile finds one side; mirror to catch the other
    flip = cv2.flip(gray, 1)
    for r in profile.detectMultiScale(flip, scaleFactor=1.08, minNeighbors=6, minSize=(minsz, minsz)):
        x, y, bw, bh = (int(v) for v in r)
        dets.append((w - x - bw, y, bw, bh))
    dets = dedupe(dets)
    boxes = []
    for (x, y, bw, bh) in dets:
        nx, ny, nw, nh = x / w, y / h, bw / w, bh / h
        boxes.append({"x": round(nx, 4), "y": round(ny, 4), "w": round(nw, 4), "h": round(nh, 4), "area": round(nw * nh, 5)})
    boxes.sort(key=lambda d: d["area"], reverse=True)
    name = os.path.basename(f)
    result[name] = {"width": w, "height": h, "faces": boxes, "faceCount": len(boxes), "maxFaceArea": boxes[0]["area"] if boxes else 0.0}
    print(f"{name}: {len(boxes)} faces, largest area {result[name]['maxFaceArea']:.4f}")

with open(out_path, "w") as fp:
    json.dump(result, fp, indent=2)
print(f"\nwrote {out_path}")
