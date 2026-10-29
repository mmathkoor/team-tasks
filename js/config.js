const SUPABASE_URL = (typeof window !== 'undefined' && window.__CFG && window.__CFG.url) || 'https://wrmpyywosathqxrjuicx.supabase.co';
const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.__CFG && window.__CFG.key) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
const VAPID_PUBLIC = (typeof window !== 'undefined' && window.__CFG && window.__CFG.vapid) || 'BC3e8bZLkH-21W_OzBDlmvKyj97z7Xwuv9geEaWz4MN7eBoty47sIUVqBO0hYzR3hNROhmIloPzMcNICfo1rM0A';
const CACHE_KEY = 'cache_v10';

const API = SUPABASE_URL, KEY = SUPABASE_ANON_KEY;
