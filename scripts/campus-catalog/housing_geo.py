"""Small, dependency-free geospatial helpers used only during catalogue builds."""
import math
import unicodedata


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.casefold().replace('ı', 'i'))
                   if not unicodedata.combining(c))


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def in_ring(point, ring):
    x, y = point
    inside = False
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[i-1]
        if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
    return inside


def polygons(feature):
    geom = feature['geometry']
    return [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']


def prepare_feature(feature):
    result = []
    for polygon in polygons(feature):
        xs, ys = zip(*polygon[0])
        result.append(((min(xs), min(ys), max(xs), max(ys)), polygon))
    return result


def inside(point, prepared):
    x, y = point
    return any(box[0] <= x <= box[2] and box[1] <= y <= box[3]
               and in_ring(point, poly[0]) and not any(in_ring(point, hole) for hole in poly[1:])
               for box, poly in prepared)


def boundary_rings(relation):
    lines = [[(p['lon'], p['lat']) for p in m['geometry']]
             for m in relation['members'] if m['type'] == 'way' and m['role'] == 'outer']
    rings = []
    while lines:
        chain = lines.pop()
        while chain[0] != chain[-1]:
            for i, line in enumerate(lines):
                if line[0] == chain[-1]:
                    chain.extend(line[1:]); lines.pop(i); break
                if line[-1] == chain[-1]:
                    chain.extend(list(reversed(line))[1:]); lines.pop(i); break
            else:
                raise ValueError('Administrative boundary has an unclosed ring')
        rings.append(chain)
    return prepare_feature({'geometry': {'type': 'MultiPolygon', 'coordinates': [[r] for r in rings]}})
