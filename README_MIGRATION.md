# Database Migration Setup - Saved Links Feature

This document explains how to set up the database for the saved links feature with default links.

## 📋 Migration File

The migration file is located at:
```
migrations/001_create_saved_links_with_defaults.sql
```

## 🚀 How to Apply the Migration

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to [https://app.supabase.com](https://app.supabase.com)
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Migration**
   - Copy the entire contents of `migrations/001_create_saved_links_with_defaults.sql`
   - Paste it into the SQL editor
   - Click "Run" to execute the migration

4. **Verify the Setup**
   - Go to "Table Editor" in the left sidebar
   - You should see a new table called `saved_links`

### Option 2: Command Line (Advanced)

If you have the Supabase CLI installed:

```bash
# Make sure you're in the project root
cd /path/to/your/scraper

# Login to Supabase (if not already logged in)
supabase login

# Link your project (replace with your project ref)
supabase link --project-ref your-project-ref

# Apply the migration
supabase db push

# Or run the SQL file directly
supabase db reset --db-url "your-database-url" --file migrations/001_create_saved_links_with_defaults.sql
```

## 🗃️ What the Migration Creates

### Tables
- **`saved_links`**: Main table for storing user saved links with metadata

### Columns
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to auth.users)
- `url` (TEXT, NOT NULL)
- `label` (TEXT, NOT NULL)
- `content_type` (TEXT, CHECK constraint: 'campaigns', 'cars', 'transport_cars')
- `brand` (TEXT, Optional)
- `car_type` (TEXT, Optional)
- `description` (TEXT, Optional)
- `created_at` (TIMESTAMPTZ, Auto-generated)
- `updated_at` (TIMESTAMPTZ, Auto-generated)
- `last_scraped` (TIMESTAMPTZ, Optional)
- `scrape_count` (INTEGER, Default: 0)
- `is_active` (BOOLEAN, Default: true)

### Security
- **Row Level Security (RLS)** enabled
- **Policies** for SELECT, INSERT, UPDATE, DELETE (users can only access their own links)

### Indexes
- `idx_saved_links_user_id`: For fast user queries
- `idx_saved_links_content_type`: For filtering by content type
- `idx_saved_links_is_active`: For filtering active links
- `idx_saved_links_updated_at`: For ordering by update time

### Functions
- **`create_default_links_for_user(uuid)`**: Creates default links for a specific user
- **`update_updated_at_column()`**: Automatically updates the updated_at timestamp

### Triggers
- **`update_saved_links_updated_at`**: Auto-updates the updated_at field on row changes

## 🎯 Default Links

The migration includes a function to create default links for new users with these URLs:

### Campaign URLs
- **Main Offers** (Multi-brand): `https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/`
- **Suzuki Campaigns** (Suzuki): `https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden`
- **Honda Campaigns** (Honda): `https://www.honda.se/cars/offers0.html`

### Car URLs
- **Personbilar** (Multi-brand, Passenger Cars): `https://kronobergsbil.bilforetag.se/vaxjo/personbilar/`
- **Suzuki Models** (Suzuki, Passenger Cars): `https://suzukibilar.se/modeller`
- **Honda Models** (Honda, Passenger Cars): `https://www.honda.se/cars.html`

### Transport URLs
- **Transportbilar** (Multi-brand, Commercial Vehicles): `https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/`

## 🧪 Testing the Setup

After running the migration, you can test it by:

1. **Login to your application**
2. **Navigate to the scraping page**
3. **Check the "Saved Links" section** - it should automatically initialize with default links
4. **Try adding a new link** using the form
5. **Try scraping from a saved link**

## 🔧 Manual Initialization

If you need to manually initialize default links for a specific user, you can run:

```sql
-- Replace 'user-uuid-here' with the actual user UUID
SELECT create_default_links_for_user('user-uuid-here');
```

## 📊 Monitoring

You can monitor saved links usage with queries like:

```sql
-- See all saved links with usage stats
SELECT 
  label, 
  url, 
  brand, 
  content_type, 
  scrape_count, 
  last_scraped,
  created_at
FROM saved_links 
WHERE is_active = true 
ORDER BY scrape_count DESC;

-- Get most used links
SELECT 
  label, 
  scrape_count, 
  brand,
  content_type
FROM saved_links 
WHERE is_active = true AND scrape_count > 0
ORDER BY scrape_count DESC
LIMIT 10;
```

## 🛡️ Security Notes

- All queries are protected by Row Level Security (RLS)
- Users can only access their own saved links
- The `user_id` is automatically set from the authenticated session
- URL validation is handled at the application level
- Soft deletes are used (is_active flag) to maintain audit trail