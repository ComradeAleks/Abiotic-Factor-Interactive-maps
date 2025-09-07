from flask import Flask, render_template, request, jsonify
import os
import json
import base64
import uuid
import re

# Get the directory containing this script and its parent directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__, 
    template_folder=os.path.dirname(__file__), 
    static_folder=os.path.join(BASE_DIR, 'static')
)

SHOW_HTTP_LOGS = True
DEBUG_MODE = False

PRESET_FOLDER = os.path.join(BASE_DIR, "data", "presets")
MAPS_FOLDER = os.path.join(BASE_DIR, "data", "app-data", "maps")
MAPS_LOADING_ORDER_FILE = os.path.join(BASE_DIR, "data", "app-data", "maps", "maps-loading-order.json")

SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
DEFAULT_IMAGE = "Unknown.png"
DEFAULT_MAP_SIZE = [1280, 720]

def validate_and_fix_image_path(entry, assets_folder):
    if "image" in entry:
        img_val = entry["image"]
        if isinstance(img_val, str) and not (img_val.startswith("http://") or img_val.startswith("https://")):
            image_path = os.path.join(assets_folder, img_val)
            if not os.path.exists(image_path):
                entry["image"] = DEFAULT_IMAGE
        elif not isinstance(img_val, str):
            entry["image"] = DEFAULT_IMAGE

def normalize_map_path(map_path):
    return map_path.replace('\\', '/')

def parse_json_lines(file_path):
    results = []
    if os.path.exists(file_path):
        with open(file_path, "r", encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    return results

def load_json_file(file_path, default=None):
    if not os.path.exists(file_path):
        return default or {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default or {}

def save_json_file(file_path, data):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def save_json_lines(file_path, items):
    with open(file_path, "w") as f:
        for item in items:
            f.write(json.dumps(item) + "\n")

def validate_request_data(data, required_fields=None):
    if not data:
        return False, "No data provided"
    if required_fields:
        for field in required_fields:
            if field not in data:
                return False, f"Missing required field: {field}"
    return True, None

def handle_exceptions(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            print(f"Error in {func.__name__}: {e}")
            return jsonify({"error": str(e)}), 500
    wrapper.__name__ = func.__name__
    return wrapper

def process_preset_entries(file_path, assets_folder):
    entries = []
    if os.path.exists(file_path):
        with open(file_path, "r", encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entry = json.loads(line)
                        validate_and_fix_image_path(entry, assets_folder)
                        entries.append(entry)
                    except json.JSONDecodeError:
                        pass
    return entries


def get_map_folder_path(map_path):
    parts = map_path.split('/')
    if len(parts) == 1:
        if '.' in parts[0]:
            map_name_without_ext = os.path.splitext(parts[0])[0]
            return os.path.join(MAPS_FOLDER, map_name_without_ext)
        else:
            return os.path.join(MAPS_FOLDER, parts[0])
    else:
        last_part = parts[-1]
        if '.' in last_part and any(last_part.lower().endswith(ext) for ext in SUPPORTED_IMAGE_EXTENSIONS):
            folder_path = '/'.join(parts[:-1])
        else:
            folder_path = '/'.join(parts)
        
        return os.path.join(MAPS_FOLDER, folder_path.replace('/', os.sep))

def get_marker_file_path(map_path):
    map_folder = get_map_folder_path(map_path)
    if not os.path.exists(map_folder):
        os.makedirs(map_folder)
    return os.path.join(map_folder, "markers.txt")

def get_item_details_file_path(map_path):
    map_folder = get_map_folder_path(map_path)
    if not os.path.exists(map_folder):
        os.makedirs(map_folder)
    return os.path.join(map_folder, "item-details.json")

def get_map_image_path(map_path):
    map_folder = get_map_folder_path(map_path)
    map_filename = os.path.basename(map_path)
    return os.path.join(map_folder, map_filename)

def load_markers_for_map(map_path):
    marker_file = get_marker_file_path(map_path)
    return parse_json_lines(marker_file)

def save_markers_for_map(map_path, markers):
    save_json_lines(get_marker_file_path(map_path), markers)

def load_all_markers():
    all_markers = []
    
    if not os.path.exists(MAPS_FOLDER):
        return all_markers
    
    for root, dirs, files in os.walk(MAPS_FOLDER):
        if "markers.txt" in files:
            marker_file = os.path.join(root, "markers.txt")
            all_markers.extend(parse_json_lines(marker_file))
    
    return all_markers


@app.route("/data/<path:filename>")
def serve_data_files(filename):
    from flask import send_from_directory
    return send_from_directory(os.path.join(BASE_DIR, "data"), filename)

@app.route("/maps/<path:map_path>")
def serve_map_files(map_path):
    from flask import send_from_directory
    
    if map_path.endswith(tuple(SUPPORTED_IMAGE_EXTENSIONS)):
        map_folder = get_map_folder_path(map_path)
        map_filename = os.path.basename(map_path)
        if os.path.exists(os.path.join(map_folder, map_filename)):
            return send_from_directory(map_folder, map_filename)
    
    return send_from_directory("data", map_path)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/converter")
def converter():
    return render_template("converter.html")


def apply_loading_order(items, folder_path, loading_order):
    order_key = folder_path if folder_path else "root"
    order_list = loading_order.get(order_key, [])
    
    ordered = [item for name in order_list for item in items if item['name'] == name]
    unordered = sorted([item for item in items if item['name'] not in order_list], key=lambda x: x['name'].lower())
    
    return ordered + unordered

def count_maps_in_folder(folder_maps):
    return sum(1 if item["type"] == "map" else item.get("mapCount", 0) for item in folder_maps)

def get_maps_recursive(folder_path, parent_path="", loading_order=None):
    if loading_order is None:
        loading_order = {}
    
    maps = []
    items = [item for item in sorted(os.listdir(folder_path)) if item != "maps-loading-order.json"]
    
    for item in items:
        item_path = os.path.join(folder_path, item)
        relative_path = os.path.join(parent_path, item) if parent_path else item
        
        if os.path.isdir(item_path):
            map_images = [f for f in os.listdir(item_path) if f.lower().endswith(tuple(SUPPORTED_IMAGE_EXTENSIONS))]
            
            if map_images:
                maps.extend([{
                    "name": map_image,
                    "type": "map",
                    "path": f"{relative_path}/{map_image}" if relative_path else map_image
                } for map_image in map_images])
            else:
                folder_maps = get_maps_recursive(item_path, relative_path, loading_order)
                if folder_maps:
                    folder_maps = apply_loading_order(folder_maps, relative_path, loading_order)
                    maps.append({
                        "name": item,
                        "type": "folder",
                        "path": relative_path,
                        "maps": folder_maps,
                        "mapCount": count_maps_in_folder(folder_maps)
                    })
    
    return apply_loading_order(maps, parent_path, loading_order)

@app.route("/api/maps")
@handle_exceptions
def get_maps():
    if not os.path.exists(MAPS_FOLDER):
        return jsonify([])

    loading_order = load_json_file(MAPS_LOADING_ORDER_FILE, {})
    return jsonify(get_maps_recursive(MAPS_FOLDER, loading_order=loading_order))


def get_sizes_recursive(folder_path, parent_path="", sizes=None):
    if sizes is None:
        sizes = {}
    
    for item in os.listdir(folder_path):
        item_path = os.path.join(folder_path, item)
        relative_path = os.path.join(parent_path, item) if parent_path else item
        
        if os.path.isdir(item_path):
            get_sizes_recursive(item_path, relative_path, sizes)
        elif item.lower().endswith(tuple(SUPPORTED_IMAGE_EXTENSIONS)):
            sizes[relative_path] = DEFAULT_MAP_SIZE
    
    return sizes

@app.route("/api/map-sizes")
@handle_exceptions
def get_map_sizes():
    return jsonify(get_sizes_recursive(MAPS_FOLDER) if os.path.exists(MAPS_FOLDER) else {})


@app.route("/api/categories")
@handle_exceptions
def get_categories():
    categories = {}
    if not os.path.exists(PRESET_FOLDER):
        return jsonify(categories)
    
    for entry in os.listdir(PRESET_FOLDER):
        entry_path = os.path.join(PRESET_FOLDER, entry)
        if os.path.isdir(entry_path):
            subcats = [f[:-4] for f in os.listdir(entry_path) if f.endswith(".txt")]
            if subcats:
                categories[entry] = subcats
        elif entry.endswith(".txt"):
            categories[entry[:-4]] = []
    
    return jsonify(categories)


@app.route("/api/markers", methods=["GET"])
@handle_exceptions
def get_markers():
    map_name = request.args.get('map')
    return jsonify(load_markers_for_map(map_name) if map_name else load_all_markers())

@app.route("/api/markers", methods=["POST"])
@handle_exceptions
def save_marker():
    marker = request.json
    valid, error = validate_request_data(marker, ['map'])
    if not valid:
        return error, 400
    
    markers = load_markers_for_map(marker['map'])
    markers.append(marker)
    save_markers_for_map(marker['map'], markers)
    return jsonify({"status": "saved"})

@app.route("/api/markers/<int:marker_id>", methods=["PUT"])
@handle_exceptions
def update_marker(marker_id):
    updated_marker = request.json
    valid, error = validate_request_data(updated_marker, ['map'])
    if not valid:
        return error, 400
    
    markers = load_markers_for_map(updated_marker['map'])
    
    for i, marker in enumerate(markers):
        if marker.get("id") == marker_id:
            markers[i] = updated_marker
            break
    else:
        markers.append(updated_marker)
    
    save_markers_for_map(updated_marker['map'], markers)
    return jsonify({"status": "updated"})


@app.route("/api/markers/<int:marker_id>", methods=["DELETE"])
@handle_exceptions
def delete_marker(marker_id):
    map_name = request.args.get('map')
    
    if map_name:
        markers = load_markers_for_map(map_name)
        marker_to_delete = next((m for m in markers if m.get("id") == marker_id), None)
        
        if marker_to_delete:
            cleaned_up = cleanup_marker_items(marker_to_delete, map_name)
            print(f"Cleaned up {len(cleaned_up)} items from marker {marker_id}")
        
        original_count = len(markers)
        markers = [m for m in markers if m.get("id") != marker_id]
        
        if len(markers) < original_count:
            save_markers_for_map(map_name, markers)
            return jsonify({"status": "deleted"})
        return "Marker not found", 404
    
    if not os.path.exists(MAPS_FOLDER):
        return "Marker not found", 404
    
    for root, dirs, files in os.walk(MAPS_FOLDER):
        if "markers.txt" in files:
            marker_file = os.path.join(root, "markers.txt")
            markers = parse_json_lines(marker_file)
            
            marker_to_delete = next((m for m in markers if m.get("id") == marker_id), None)
            original_count = len(markers)
            markers = [m for m in markers if m.get("id") != marker_id]
            
            if len(markers) < original_count:
                if marker_to_delete:
                    relative_path = os.path.relpath(root, MAPS_FOLDER)
                    map_name_from_path = relative_path.replace(os.sep, '/')
                    cleaned_up = cleanup_marker_items(marker_to_delete, map_name_from_path)
                    print(f"Cleaned up {len(cleaned_up)} items from marker {marker_id}")
                
                save_json_lines(marker_file, markers)
                return jsonify({"status": "deleted"})
    
    return "Marker not found", 404


@app.route("/api/presets/<preset_type>")
def get_presets_by_type(preset_type):
    path = os.path.join(PRESET_FOLDER, f"{preset_type}.txt")
    assets_folder = os.path.join(BASE_DIR, "data", "assets", preset_type)
    return jsonify(process_preset_entries(path, assets_folder))

@app.route("/api/presets/<category>/<subcategory>")
def get_presets_by_subcategory(category, subcategory):
    path = os.path.join(PRESET_FOLDER, category, f"{subcategory}.txt")
    assets_folder = os.path.join(BASE_DIR, "data", "assets", category, subcategory)
    return jsonify(process_preset_entries(path, assets_folder))


@app.route("/presets/<path:filename>")
@handle_exceptions
def serve_preset_file(filename):
    from flask import send_from_directory, abort
    
    preset_path = os.path.join(PRESET_FOLDER, filename)
    
    if not os.path.exists(preset_path):
        print(f"Preset file not found: {preset_path}")
        abort(404)
    
    directory = os.path.dirname(preset_path)
    file_name = os.path.basename(preset_path)
    return send_from_directory(directory, file_name, mimetype='text/plain')


def scan_directory(directory, category_prefix="", result=None):
    if result is None:
        result = {}
    
    for item in os.listdir(directory):
        item_path = os.path.join(directory, item)
        
        if os.path.isfile(item_path) and item.endswith(".txt"):
            key = f"{category_prefix}/{item[:-4]}" if category_prefix else item[:-4]
            assets_folder = os.path.join(BASE_DIR, "data", "assets", category_prefix or key)
            result[key] = process_preset_entries(item_path, assets_folder)
        elif os.path.isdir(item_path):
            new_prefix = f"{category_prefix}/{item}" if category_prefix else item
            scan_directory(item_path, new_prefix, result)
    
    return result

@app.route("/api/presets")
@handle_exceptions
def get_all_presets():
    return jsonify(scan_directory(PRESET_FOLDER))

@app.route("/api/save-pinned-popups", methods=["POST"])
@handle_exceptions
def save_pinned_popups():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Invalid data format"}), 400
    
    PINNED_FILE = os.path.join(BASE_DIR, "data", "app-data", "pinned.txt")
    get_marker_key = lambda marker_id: "-".join(map(str, sorted(marker_id))) if isinstance(marker_id, list) else str(marker_id)
    
    pinned = {}
    for line in parse_json_lines(PINNED_FILE):
        if "markerID" in line:
            pinned[get_marker_key(line["markerID"])] = line
    
    if len(data) == 0:
        pinned = {}
    else:
        for item in data:
            if isinstance(item, dict) and "markerID" in item:
                key = get_marker_key(item["markerID"])
                if item.get("remove", False):
                    pinned.pop(key, None)
                else:
                    pinned[key] = item
    
    with open(PINNED_FILE, "w", encoding="utf-8") as f:
        for obj in pinned.values():
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
    
    return jsonify({"status": "saved", "count": len(pinned)})

@app.route("/api/load-pinned-popups", methods=["GET"])
def load_pinned_popups():
    return jsonify(parse_json_lines(os.path.join(BASE_DIR, "data", "app-data", "pinned.txt")))

@app.route("/api/item-details", methods=["GET"])
def get_item_details():
    map_name = request.args.get('map')
    if not map_name:
        return jsonify({})
    return jsonify(load_json_file(get_item_details_file_path(map_name), {}))

@app.route("/api/item-details", methods=["POST"])
@handle_exceptions
def save_item_details():
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data format, expected object"}), 400
    
    map_name = request.args.get('map')
    if not map_name:
        return jsonify({"error": "Map parameter is required"}), 400
    
    save_json_file(get_item_details_file_path(map_name), data)
    return jsonify({"success": True, "message": f"Item details saved successfully for map {map_name}"})


@app.route("/api/upload-image", methods=["POST"])
@handle_exceptions
def upload_image():
    data = request.get_json()
    valid, error = validate_request_data(data, ['imageData'])
    if not valid:
        return jsonify({"error": error}), 400
    
    map_name = request.args.get('map')
    if not map_name:
        return jsonify({"error": "Map parameter is required"}), 400
    
    if DEBUG_MODE:
        print(f"DEBUG: Received map_name: '{map_name}'")
    
    image_data = data['imageData']
    file_extension = data.get('fileExtension', 'png')
    
    if ',' in image_data:
        image_data = image_data.split(',')[1]
    
    image_bytes = base64.b64decode(image_data)
    filename = f"{uuid.uuid4().hex}.{file_extension}"
    
    map_name_normalized = normalize_map_path(map_name)
    if DEBUG_MODE:
        print(f"DEBUG: Normalized map_name: '{map_name_normalized}'")
    
    map_folder = get_map_folder_path(map_name_normalized)
    if DEBUG_MODE:
        print(f"DEBUG: Map folder path: '{map_folder}'")
    
    images_folder = os.path.join(map_folder, "images")
    if DEBUG_MODE:
        print(f"DEBUG: Images folder path: '{images_folder}'")
    
    os.makedirs(images_folder, exist_ok=True)
    
    with open(os.path.join(images_folder, filename), 'wb') as f:
        f.write(image_bytes)
    
    return jsonify({"success": True, "imagePath": f"images/{filename}", "message": "Image uploaded successfully"})

@app.route("/api/delete-image", methods=["DELETE"])
@handle_exceptions
def delete_image():
    data = request.get_json()
    valid, error = validate_request_data(data, ['imagePath'])
    if not valid:
        return jsonify({"error": error}), 400
    
    map_name = request.args.get('map')
    if not map_name:
        return jsonify({"error": "Map parameter is required"}), 400
    
    image_path = data['imagePath']
    filename = image_path.split('/')[-1] if image_path.startswith('/api/map-images/') else os.path.basename(image_path)
    
    map_name_normalized = normalize_map_path(map_name)
    map_folder = get_map_folder_path(map_name_normalized)
    full_image_path = os.path.join(map_folder, "images", filename)
    
    if os.path.exists(full_image_path):
        os.remove(full_image_path)
        return jsonify({"success": True, "message": "Image deleted successfully"})
    else:
        return jsonify({"success": False, "error": "Image file not found"})


@app.route("/api/map-images/<path:image_path>")
@handle_exceptions
def serve_map_images(image_path):
    from flask import send_from_directory
    
    if '/images/' not in image_path:
        return "Invalid image path", 400
        
    path_parts = image_path.split('/images/')
    if len(path_parts) != 2:
        return "Invalid image path format", 400
        
    map_path, filename = path_parts
    if DEBUG_MODE:
        print(f"DEBUG: Serving image - map_path: '{map_path}', filename: '{filename}'")
    
    map_path_normalized = normalize_map_path(map_path)
    map_folder = get_map_folder_path(map_path_normalized)
    images_folder = os.path.join(map_folder, "images")
    
    if DEBUG_MODE:
        print(f"DEBUG: Looking for image at: {os.path.join(images_folder, filename)}")
    
    if os.path.exists(os.path.join(images_folder, filename)):
        return send_from_directory(images_folder, filename)
    else:
        return "Image not found", 404


def cleanup_item_from_details(map_name, item_key):
    try:
        map_name_normalized = normalize_map_path(map_name)
        item_details_path = get_item_details_file_path(map_name_normalized)
        item_details = load_json_file(item_details_path, {})
        
        if item_key in item_details:
            item_data = item_details[item_key]
            
            if 'additionalImage' in item_data and item_data['additionalImage']:
                for image_url in item_data['additionalImage'].split(','):
                    image_url = image_url.strip()
                    if image_url and '/api/map-images/' in image_url:
                        try:
                            filename = os.path.basename(image_url)
                            map_folder = get_map_folder_path(map_name_normalized)
                            image_path = os.path.join(map_folder, "images", filename)
                            
                            if os.path.exists(image_path):
                                os.remove(image_path)
                                print(f"Deleted image: {image_path}")
                        except Exception as e:
                            print(f"Error deleting image {image_url}: {e}")
            
            del item_details[item_key]
            save_json_file(item_details_path, item_details)
            print(f"Cleaned up item {item_key} from {map_name}")
            return True
    except Exception as e:
        print(f"Error cleaning up item {item_key} from details: {e}")
    return False

@app.route("/api/cleanup-items", methods=["POST"])
@handle_exceptions
def cleanup_items():
    data = request.get_json()
    valid, error = validate_request_data(data, ['itemKeys'])
    if not valid:
        return jsonify({"error": error}), 400
    
    map_name = request.args.get('map')
    if not map_name:
        return jsonify({"error": "Map parameter is required"}), 400
    
    item_keys = data['itemKeys']
    if not isinstance(item_keys, list):
        return jsonify({"error": "itemKeys must be an array"}), 400
    
    cleaned_up = [item_key for item_key in item_keys if cleanup_item_from_details(map_name, item_key)]
    
    return jsonify({"success": True, "cleanedUp": cleaned_up, "message": f"Cleaned up {len(cleaned_up)} items"})


def cleanup_marker_items(marker, map_name):
    if not marker or 'entries' not in marker:
        return []
    
    marker_id = marker.get('id', 'unknown')
    cleaned_up = []
    
    for entry in marker['entries']:
        if 'items' in entry:
            for item in entry['items']:
                item_name = item.get('itemname', '')
                if item_name:
                    sanitized_name = re.sub(r'[^a-zA-Z0-9\s]', '', item_name).replace(' ', '_')
                    item_key = f"{marker_id}_{sanitized_name}"
                    
                    if cleanup_item_from_details(map_name, item_key):
                        cleaned_up.append(item_key)
    
    return cleaned_up

if __name__ == "__main__":
    import logging
    if not SHOW_HTTP_LOGS:
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)
    
    app.run(debug=DEBUG_MODE)