"""
Script to generate all Android and Expo app icons and logos for FamInfo Sales.
Source: assets/fam-logo.png
"""
import os
from PIL import Image, ImageDraw

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(ROOT_DIR, 'assets')
RES_DIR = os.path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res')
LOGO_PATH = os.path.join(ASSETS_DIR, 'fam-logo.png')

MIPMAP_SPECS = {
    'mipmap-mdpi': {'launcher': 48, 'foreground': 108},
    'mipmap-hdpi': {'launcher': 72, 'foreground': 162},
    'mipmap-xhdpi': {'launcher': 96, 'foreground': 216},
    'mipmap-xxhdpi': {'launcher': 144, 'foreground': 324},
    'mipmap-xxxhdpi': {'launcher': 192, 'foreground': 432},
}

def create_circular_icon(square_img: Image.Image) -> Image.Image:
    """Create a circular version of the square icon with smooth anti-aliased edges."""
    size = square_img.size
    scale = 4
    large_size = (size[0] * scale, size[1] * scale)
    
    mask = Image.new('L', large_size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, large_size[0] - 1, large_size[1] - 1), fill=255)
    mask = mask.resize(size, Image.Resampling.LANCZOS)
    
    output = square_img.copy().convert('RGBA')
    output.putalpha(mask)
    return output

def generate_all_icons():
    print(f"Loading base logo from: {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert('RGBA')
    logo_w, logo_h = logo.size
    aspect = logo_w / logo_h

    # 1. Generate assets/icon.png (1024x1024, white background, logo ~820px wide)
    target_w = 820
    target_h = int(target_w / aspect)
    logo_scaled = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    icon_1024 = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    offset_x = (1024 - target_w) // 2
    offset_y = (1024 - target_h) // 2
    icon_1024.paste(logo_scaled, (offset_x, offset_y), logo_scaled)
    icon_1024.save(os.path.join(ASSETS_DIR, 'icon.png'), format='PNG')
    print("[+] Saved assets/icon.png (1024x1024)")

    # 2. Generate assets/android-icon-foreground.png (1024x1024, transparent, safe zone 620px wide)
    fg_target_w = 620
    fg_target_h = int(fg_target_w / aspect)
    fg_logo_scaled = logo.resize((fg_target_w, fg_target_h), Image.Resampling.LANCZOS)
    
    fg_1024 = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    fg_offset_x = (1024 - fg_target_w) // 2
    fg_offset_y = (1024 - fg_target_h) // 2
    fg_1024.paste(fg_logo_scaled, (fg_offset_x, fg_offset_y), fg_logo_scaled)
    fg_1024.save(os.path.join(ASSETS_DIR, 'android-icon-foreground.png'), format='PNG')
    print("[+] Saved assets/android-icon-foreground.png (1024x1024)")

    # 3. Generate assets/android-icon-background.png (1024x1024, pure white)
    bg_1024 = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    bg_1024.save(os.path.join(ASSETS_DIR, 'android-icon-background.png'), format='PNG')
    print("[+] Saved assets/android-icon-background.png (1024x1024)")

    # 4. Generate assets/splash-icon.png (1024x1024)
    splash_icon = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    splash_w = 750
    splash_h = int(splash_w / aspect)
    splash_logo = logo.resize((splash_w, splash_h), Image.Resampling.LANCZOS)
    splash_icon.paste(splash_logo, ((1024 - splash_w) // 2, (1024 - splash_h) // 2), splash_logo)
    splash_icon.save(os.path.join(ASSETS_DIR, 'splash-icon.png'), format='PNG')
    print("[+] Saved assets/splash-icon.png (1024x1024)")

    # 5. Generate assets/favicon.png (48x48)
    fav_w = 42
    fav_h = int(fav_w / aspect)
    fav_logo = logo.resize((fav_w, fav_h), Image.Resampling.LANCZOS)
    favicon = Image.new('RGBA', (48, 48), (255, 255, 255, 255))
    favicon.paste(fav_logo, ((48 - fav_w) // 2, (48 - fav_h) // 2), fav_logo)
    favicon.save(os.path.join(ASSETS_DIR, 'favicon.png'), format='PNG')
    print("[+] Saved assets/favicon.png (48x48)")

    # 6. Generate Android native mipmaps if android/ directory exists
    if os.path.exists(RES_DIR):
        for folder_name, specs in MIPMAP_SPECS.items():
            folder_path = os.path.join(RES_DIR, folder_name)
            os.makedirs(folder_path, exist_ok=True)
            
            # Legacy launcher icon (e.g. 48x48, 72x72...)
            launcher_size = specs['launcher']
            # Rescale icon_1024
            launcher_img = icon_1024.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
            launcher_img.save(os.path.join(folder_path, 'ic_launcher.webp'), format='WEBP')
            
            # Round icon
            round_img = create_circular_icon(launcher_img)
            round_img.save(os.path.join(folder_path, 'ic_launcher_round.webp'), format='WEBP')
            
            # Adaptive foreground icon (e.g. 108x108, 162x162...)
            fg_size = specs['foreground']
            fg_img = fg_1024.resize((fg_size, fg_size), Image.Resampling.LANCZOS)
            fg_img.save(os.path.join(folder_path, 'ic_launcher_foreground.webp'), format='WEBP')
            
            # Adaptive background (pure white)
            bg_img = Image.new('RGBA', (fg_size, fg_size), (255, 255, 255, 255))
            bg_img.save(os.path.join(folder_path, 'ic_launcher_background.webp'), format='WEBP')
            
            print(f"[+] Updated Android {folder_name} (launcher={launcher_size}px, fg={fg_size}px)")

    print("\nAll icons generated successfully!")

if __name__ == '__main__':
    generate_all_icons()
