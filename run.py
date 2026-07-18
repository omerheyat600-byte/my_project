import os
import sys
from waitress import serve
from app import app, init_db, init_user_table
from utils.license import check_license

if __name__ == "__main__":
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    os.chdir(base_dir)
    print(f"📁 Working directory: {os.getcwd()}")

    license_status = check_license()
    if license_status['valid']:
        print("✅ License valid.")
        if license_status['days_remaining'] is not None:
            print(f"   {license_status['message']}")
    else:
        print(f"⚠️  {license_status['message']}")
        print("⚠️  Starting anyway — the app will show a 'please get a license' "
              "message on every page/API call until this is resolved.")

    print("🔄 Creating database tables...")
    init_db()
    init_user_table()
    print("✅ Database tables ready")

    from utils.backup_scheduler import start as start_backup_scheduler
    start_backup_scheduler()
    print("🗄️  Automatic daily backup scheduler started (2:00 AM, 14-day retention)")

    # Render (and most PaaS hosts) inject PORT and require binding 0.0.0.0.
    # Locally / as the .exe, nothing sets these, so behavior is unchanged:
    # still 127.0.0.1:5004.
    port = int(os.environ.get("PORT", "5004"))
    # If PORT is set (Render/most PaaS hosts do this), default to 0.0.0.0
    # since 127.0.0.1 wouldn't be reachable from outside the container.
    default_host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    host = os.environ.get("HOST", default_host)

    print(f"🚀 Starting EduAdmin on http://{host}:{port}")
    serve(app, host=host, port=port)
