import cloudinary
import cloudinary.uploader
import os
from dotenv import load_dotenv

load_dotenv()

# Configure Cloudinary
# Ensure these env vars are set: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
cloudinary.config( 
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
  api_key = os.getenv("CLOUDINARY_API_KEY"), 
  api_secret = os.getenv("CLOUDINARY_API_SECRET"),
  secure = True
)

def upload_image(file_object, unique_filename):
    """
    Uploads a file-like object to Cloudinary.
    Returns the secure URL of the uploaded image.
    """
    # Check if Cloudinary is configured (i.e. if env vars exist)
    if not os.getenv("CLOUDINARY_CLOUD_NAME"):
        print("Cloudinary not configured. Fallback to local storage logic should affect here if needed.")
        return None

    try:
        # public_id allows us to specify the filename (w/o extension potentially, 
        # but Cloudinary handles that). We just use the unique ID as the public_id.
        # file_object can be a file path or a stream using .file
        
        # Strip extension for public_id as Cloudinary adds it
        public_id = os.path.splitext(unique_filename)[0]

        response = cloudinary.uploader.upload(
            file_object, 
            public_id = public_id,
            folder = "map_album_uploads" 
        )
        return response['secure_url']
    except Exception as e:
        print(f"Cloudinary Upload Error: {e}")
        return None
