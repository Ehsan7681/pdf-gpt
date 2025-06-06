# سیستم پرسش و پاسخ اسناد

سیستم پرسش و پاسخ اسناد یک اپلیکیشن تحت وب برای تحلیل، پرسش و پاسخ و خلاصه‌سازی انواع فایل‌های متنی با استفاده از هوش مصنوعی است. این سیستم امکان آپلود فایل‌های PDF، Word و متنی را فراهم کرده و به کاربران اجازه می‌دهد با محتوای اسناد خود تعامل کنند.

## ویژگی‌های اصلی

- **پشتیبانی از انواع فایل**: امکان آپلود و پردازش فایل‌های PDF، DOCX و TXT
- **رابط کاربری دوزبانه**: پشتیبانی کامل از زبان فارسی و راست‌چین
- **تم روشن و تاریک**: قابلیت تغییر تم برنامه بین حالت روشن و تاریک
- **ذخیره‌سازی خودکار**: ذخیره گفتگوها و فایل‌های آپلود شده در حافظه مرورگر
- **پاسخ‌دهی به سؤالات**: پرسش سؤالات مختلف در مورد محتوای فایل آپلود شده
- **خلاصه‌سازی محتوا**: امکان درخواست خلاصه از بخش‌های مختلف سند

## نسخه‌های موجود

این سیستم در دو نسخه ارائه شده است:

1. **نسخه محلی**: اجرا به صورت محلی و بدون نیاز به کلید API
2. **نسخه آنلاین**: اتصال به OpenRouter برای استفاده از انواع مدل‌های هوش مصنوعی

## نحوه استفاده

### نسخه محلی

1. فایل `index.html` را در مرورگر خود باز کنید
2. روی دکمه "اتصال به هوش مصنوعی" کلیک کنید
3. با کلیک روی "انتخاب فایل PDF یا Word" سند خود را بارگذاری کنید
4. سؤال خود را در کادر پایین صفحه تایپ کرده و دکمه "ارسال" را بزنید
5. پاسخ در قسمت گفتگو نمایش داده می‌شود

### نسخه آنلاین

1. فایل `online-index.html` را در مرورگر خود باز کنید
2. کلید API خود را از سایت [OpenRouter](https://openrouter.ai) دریافت کنید
3. کلید API را در کادر مربوطه وارد کرده و مدل مورد نظر را از منوی کشویی انتخاب کنید
4. روی دکمه "اعمال" کلیک کنید
5. با کلیک روی دکمه "اتصال" به سرویس OpenRouter متصل شوید
6. فایل خود را بارگذاری کرده و پرسش خود را ارسال کنید

## تنظیمات OpenRouter

برای استفاده از نسخه آنلاین، باید این مراحل را دنبال کنید:

1. در سایت [OpenRouter](https://openrouter.ai) ثبت‌نام کنید
2. یک کلید API ایجاد کنید
3. کلید API را در قسمت بالای صفحه برنامه وارد کنید
4. مدل مورد نظر خود را از منوی کشویی انتخاب کنید (قابلیت جستجو بین مدل‌ها)
5. روی دکمه "اعمال" کلیک کنید

## ویژگی‌های نسخه آنلاین

- **انتخاب مدل هوش مصنوعی**: امکان انتخاب از بین ده‌ها مدل هوش مصنوعی مختلف
- **جستجو در مدل‌ها**: قابلیت جستجو در بین مدل‌های موجود
- **نمایش قیمت مدل‌ها**: نمایش هزینه هر مدل بر اساس میلیون توکن
- **اتصال هوشمند**: بررسی خودکار وضعیت اتصال به API

## تکنولوژی‌های استفاده شده

- HTML5, CSS3, JavaScript
- PDF.js برای پردازش فایل‌های PDF
- Mammoth.js برای پردازش فایل‌های Word
- Marked.js برای پردازش Markdown
- Select2 برای منوی انتخاب پیشرفته با قابلیت جستجو
- OpenRouter API برای اتصال به مدل‌های مختلف هوش مصنوعی

## نکات مهم

- تمام داده‌ها به صورت محلی در مرورگر ذخیره می‌شوند و هیچ اطلاعاتی به سرور ارسال نمی‌شود
- کلید API و گفتگوها در localStorage مرورگر ذخیره می‌شوند
- برای فایل‌های بزرگ، ممکن است محدودیت‌هایی در پردازش وجود داشته باشد
- برای بهترین نتیجه، از مرورگرهای Chrome یا Firefox نسخه‌های جدید استفاده کنید 