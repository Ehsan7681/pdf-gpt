document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const fileName = document.getElementById('fileName');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const chatMessages = document.getElementById('chatMessages');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const toggleButton = document.getElementById('toggleConnection');
    const clearChatButton = document.getElementById('clearChat');
    const confirmDialog = document.getElementById('confirmDialog');
    const confirmClearButton = document.getElementById('confirmClear');
    const cancelClearButton = document.getElementById('cancelClear');
    const newMessagesIndicator = document.getElementById('newMessagesIndicator');
    const themeToggle = document.getElementById('themeToggle');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyButton = document.getElementById('saveApiKey');
    const modelSelect = document.getElementById('modelSelect');
    
    let currentFile = null;
    let fileContent = '';
    let isConnected = false;
    let connectionCheckInterval = null;
    let activeResponse = null; // برای نگهداری پاسخ فعلی در حالت streaming
    let fileDetails = null; // برای ذخیره جزئیات فایل
    let userWasAtBottom = true; // آیا کاربر در انتهای چت بوده است
    let hasNewMessages = false; // آیا پیام جدیدی دریافت شده است

    // تنظیمات OpenRouter API
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
    let API_KEY = '';
    let selectedModel = '';

    // ثابت‌های localStorage
    const STORAGE_CHAT_MESSAGES = 'pdf_online_chat_messages';
    const STORAGE_FILE_INFO = 'pdf_online_file_info';
    const STORAGE_THEME = 'pdf_online_theme';
    const STORAGE_API_KEY = 'pdf_online_api_key';
    const STORAGE_MODEL = 'pdf_online_model';

    // لیست مدل‌های پیش‌فرض OpenRouter
    const DEFAULT_MODELS = [
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
        { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
        { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
        { id: 'google/gemini-pro', name: 'Gemini Pro' },
        { id: 'meta-llama/llama-3-8b-instruct', name: 'Llama 3 8B' },
        { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B' },
        { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B' },
        { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B' },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        { id: 'openai/gpt-4', name: 'GPT-4' },
        { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' }
    ];

    // تنظیم مارک‌داون برای امنیت و راست‌چین بودن
    marked.setOptions({
        headerIds: false,
        mangle: false,
        breaks: true,
        gfm: true,
        sanitize: false, // امکان استفاده از HTML
        pedantic: false,
        smartLists: true, // بهبود لیست‌ها
        smartypants: true // بهبود نقل قول‌ها
    });

    // بارگیری مدل‌های واقعی از OpenRouter
    async function fetchOpenRouterModels() {
        if (!API_KEY) {
            return false;
        }
        
        try {
            updateConnectionStatus('در حال دریافت مدل‌ها...', 'checking');
            
            const response = await fetch(OPENROUTER_MODELS_URL, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'PDF Document QA System'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                addMessage('سیستم', `خطا در دریافت مدل‌ها: ${errorData?.error?.message || response.statusText}`, 'bot', true, true);
                return false;
            }
            
            const data = await response.json();
            
            if (data && data.data && Array.isArray(data.data)) {
                // پاک کردن گزینه‌های قبلی به جز اولین گزینه
                while (modelSelect.options.length > 1) {
                    modelSelect.remove(1);
                }
                
                // مرتب‌سازی مدل‌ها بر اساس قیمت (از کمترین به بیشترین)
                data.data.sort((a, b) => {
                    const priceA = a.pricing?.prompt || 0;
                    const priceB = b.pricing?.prompt || 0;
                    return priceA - priceB;
                });
                
                // اضافه کردن مدل‌های دریافت شده به لیست
                data.data.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    
                    // نمایش نام مدل به همراه قیمت
                    let displayName = model.name || model.id;
                    if (model.pricing && model.pricing.prompt) {
                        displayName += ` ($${model.pricing.prompt}/1M tokens)`;
                    }
                    
                    option.textContent = displayName;
                    modelSelect.appendChild(option);
                });
                
                // بررسی مدل ذخیره شده
                const savedModel = localStorage.getItem(STORAGE_MODEL);
                if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
                    modelSelect.value = savedModel;
                    selectedModel = savedModel;
                } else if (modelSelect.options.length > 1) {
                    // انتخاب اولین مدل به صورت پیش‌فرض
                    modelSelect.selectedIndex = 1;
                    selectedModel = modelSelect.value;
                    localStorage.setItem(STORAGE_MODEL, selectedModel);
                }
                
                // بازسازی کادر Select2 با مقادیر جدید
                try {
                    if (typeof $ !== 'undefined' && $.fn.select2) {
                        $('#modelSelect').select2('destroy');
                        $('#modelSelect').select2({
                            placeholder: 'جستجو یا انتخاب مدل...',
                            allowClear: true,
                            dir: 'rtl',
                            language: {
                                noResults: function() {
                                    return "نتیجه‌ای یافت نشد";
                                },
                                searching: function() {
                                    return "در حال جستجو...";
                                }
                            },
                            width: '100%'
                        });
                        
                        // انتخاب مدل ذخیره شده در Select2
                        $('#modelSelect').val(selectedModel).trigger('change');
                    }
                } catch (e) {
                    console.error('خطا در بازسازی Select2:', e);
                }
                
                return true;
            } else {
                addMessage('سیستم', 'خطا در پردازش داده‌های مدل‌ها', 'bot', true, true);
                return false;
            }
        } catch (error) {
            console.error('خطا در دریافت مدل‌ها:', error);
            addMessage('سیستم', `خطا در دریافت مدل‌ها: ${error.message}`, 'bot', true, true);
            return false;
        } finally {
            updateConnectionStatus('قطع', '');
        }
    }

    // پر کردن لیست مدل‌ها
    function populateModelSelect() {
        // پاک کردن گزینه‌های قبلی به جز اولین گزینه
        while (modelSelect.options.length > 1) {
            modelSelect.remove(1);
        }
        
        // اضافه کردن مدل‌های پیش‌فرض به عنوان نگهدارنده تا زمان دریافت مدل‌های واقعی
        DEFAULT_MODELS.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        
        // بررسی مدل ذخیره شده
        const savedModel = localStorage.getItem(STORAGE_MODEL);
        if (savedModel) {
            modelSelect.value = savedModel;
            selectedModel = savedModel;
        }
    }

    // مدیریت حالت تاریک و روشن
    function initTheme() {
        const savedTheme = localStorage.getItem(STORAGE_THEME);
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }
    
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // ذخیره حالت جدید
        localStorage.setItem(STORAGE_THEME, newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    }
    
    // ذخیره و بازیابی API Key
    function saveApiKeySettings() {
        const apiKey = apiKeyInput.value.trim();
        const model = modelSelect.value || $('#modelSelect').val();
        
        if (!apiKey) {
            addMessage('سیستم', 'لطفاً یک کلید API معتبر وارد کنید.', 'bot', true, true);
            return;
        }
        
        if (!model) {
            addMessage('سیستم', 'لطفاً یک مدل را انتخاب کنید.', 'bot', true, true);
            return;
        }
        
        // ذخیره تنظیمات
        localStorage.setItem(STORAGE_API_KEY, apiKey);
        localStorage.setItem(STORAGE_MODEL, model);
        
        API_KEY = apiKey;
        selectedModel = model;
        
        addMessage('سیستم', 'تنظیمات API با موفقیت ذخیره شد.', 'bot', true, true);
        
        // دریافت مدل‌های واقعی بعد از تغییر API key
        fetchOpenRouterModels().then(success => {
            // بررسی اتصال بعد از دریافت مدل‌ها
            checkConnection();
        });
    }
    
    function loadApiKeySettings() {
        const savedApiKey = localStorage.getItem(STORAGE_API_KEY);
        const savedModel = localStorage.getItem(STORAGE_MODEL);
        
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
            API_KEY = savedApiKey;
        }
        
        if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
            modelSelect.value = savedModel;
            selectedModel = savedModel;
        }
    }
    
    // اعمال تم ذخیره شده در هنگام بارگذاری
    initTheme();
    
    // پر کردن لیست مدل‌ها با مدل‌های پیش‌فرض
    populateModelSelect();
    
    // بازیابی تنظیمات API
    loadApiKeySettings();
    
    // راه‌اندازی Select2 برای کادر انتخاب مدل با قابلیت جستجو
    try {
        $(document).ready(function() {
            $('#modelSelect').select2({
                placeholder: 'جستجو یا انتخاب مدل...',
                allowClear: true,
                dir: 'rtl',
                language: {
                    noResults: function() {
                        return "نتیجه‌ای یافت نشد";
                    },
                    searching: function() {
                        return "در حال جستجو...";
                    }
                },
                width: '100%'
            });
            
            // تغییر خودکار تم Select2 با تغییر تم برنامه
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.attributeName === 'data-theme') {
                        $('#modelSelect').select2('destroy');
                        $('#modelSelect').select2({
                            placeholder: 'جستجو یا انتخاب مدل...',
                            allowClear: true,
                            dir: 'rtl',
                            language: {
                                noResults: function() {
                                    return "نتیجه‌ای یافت نشد";
                                },
                                searching: function() {
                                    return "در حال جستجو...";
                                }
                            },
                            width: '100%'
                        });
                    }
                });
            });
            
            observer.observe(document.documentElement, { attributes: true });
        });
    } catch (e) {
        console.error('خطا در راه‌اندازی Select2:', e);
    }
    
    // دریافت مدل‌های واقعی اگر API Key وجود داشته باشد
    if (API_KEY) {
        fetchOpenRouterModels().then(success => {
            // بررسی اتصال فقط در صورت موفقیت دریافت مدل‌ها یا در صورت عدم نیاز به دریافت مدل‌ها
            checkConnection();
        });
    } else {
        disconnect();
        addMessage('سیستم', 'برای استفاده از برنامه، لطفاً کلید API و مدل مورد نظر را وارد کنید.', 'bot', true, true);
    }

    // اضافه کردن رویداد کلیک به دکمه تغییر تم
    themeToggle.addEventListener('click', toggleTheme);
    
    // اضافه کردن رویداد کلیک به دکمه ذخیره API Key
    saveApiKeyButton.addEventListener('click', saveApiKeySettings);

    // بازیابی اطلاعات ذخیره شده
    loadChatHistory();
    loadFileInfo();

    // مدیریت پاک کردن گفتگو
    clearChatButton.addEventListener('click', () => {
        // نمایش دیالوگ تایید
        confirmDialog.classList.add('active');
    });

    // دکمه انصراف در دیالوگ تایید
    cancelClearButton.addEventListener('click', () => {
        confirmDialog.classList.remove('active');
    });

    // دکمه تایید پاک کردن
    confirmClearButton.addEventListener('click', () => {
        // پاک کردن تمام پیام‌ها
        chatMessages.innerHTML = '';
        
        // پاک کردن داده‌های ذخیره شده
        localStorage.removeItem(STORAGE_CHAT_MESSAGES);
        
        // بستن دیالوگ
        confirmDialog.classList.remove('active');
        
        // اضافه کردن پیام سیستمی
        addMessage('سیستم', 'تمام گفتگوها پاک شد.', 'bot', true, true);
    });

    // کلیک خارج از دیالوگ برای بستن آن
    confirmDialog.addEventListener('click', (e) => {
        if (e.target === confirmDialog) {
            confirmDialog.classList.remove('active');
        }
    });

    // مدیریت دکمه قطع و وصل
    toggleButton.addEventListener('click', async () => {
        if (isConnected) {
            disconnect();
        } else {
            await connect(true);
        }
    });

    // بررسی دوره‌ای اتصال (هر 30 ثانیه)
    function startConnectionCheck() {
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
        }
        
        connectionCheckInterval = setInterval(() => {
            if (isConnected) {
                pingServer();
            }
        }, 30000);
    }

    // ارسال درخواست بررسی اتصال
    async function pingServer() {
        if (!API_KEY || !selectedModel) {
            disconnect(true);
            return;
        }
        
        try {
            updateConnectionStatus('در حال بررسی...', 'checking');
            
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'PDF Document QA System'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [{ role: "user", content: "ping" }],
                    max_tokens: 1
                }),
                signal: AbortSignal.timeout(5000) // تایم‌اوت 5 ثانیه
            });
            
            if (!response.ok) {
                disconnect(true);
                const errorData = await response.json().catch(() => null);
                addMessage('سیستم', `خطا در اتصال: ${errorData?.error?.message || response.statusText}`, 'bot', true, true);
            } else {
                connect();
            }
        } catch (error) {
            console.warn('خطا در بررسی اتصال:', error);
            disconnect(true);
        }
    }

    async function checkConnection() {
        if (!API_KEY || !selectedModel) {
            disconnect();
            return false;
        }
        
        updateConnectionStatus('در حال بررسی...', 'checking');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'PDF Document QA System'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [{ role: "user", content: "test" }],
                    max_tokens: 1
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                connect();
                return true;
            } else {
                const errorData = await response.json().catch(() => null);
                disconnect();
                addMessage('سیستم', `خطا در اتصال: ${errorData?.error?.message || response.statusText}`, 'bot', true, true);
                return false;
            }
        } catch (error) {
            console.error('خطا در بررسی اتصال:', error);
            disconnect();
            addMessage('سیستم', `خطا در اتصال: ${error.message}`, 'bot', true, true);
            return false;
        }
    }

    function updateConnectionStatus(text, state) {
        statusText.textContent = text;
        
        // حذف همه کلاس‌های وضعیت
        statusDot.classList.remove('connected', 'checking');
        toggleButton.classList.remove('connected', 'checking');
        
        // اضافه کردن کلاس وضعیت جدید
        if (state) {
            statusDot.classList.add(state);
            toggleButton.classList.add(state);
        }
    }

    function connect(showMessage = false) {
        isConnected = true;
        updateConnectionStatus('متصل', 'connected');
        toggleButton.textContent = 'قطع اتصال';
        if (showMessage) {
            addMessage('سیستم', 'اتصال به OpenRouter برقرار شد.', 'bot', true, true);
        }
        startConnectionCheck();
    }

    function disconnect(showMessage = false) {
        isConnected = false;
        updateConnectionStatus('قطع', '');
        toggleButton.textContent = 'اتصال';
        if (showMessage) {
            addMessage('سیستم', 'اتصال به OpenRouter قطع شد.', 'bot', true, true);
        }
        
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
            connectionCheckInterval = null;
        }
    }

    // افزودن تابع بررسی کننده موقعیت اسکرول
    function isScrolledToBottom() {
        const threshold = 100; // آستانه فاصله از انتها (پیکسل)
        return chatMessages.scrollHeight - chatMessages.clientHeight - chatMessages.scrollTop < threshold;
    }
    
    // تابع اسکرول به انتها، فقط زمانی که کاربر در انتها باشد
    function scrollToBottomIfNeeded() {
        if (userWasAtBottom) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            // اگر کاربر در انتها نیست، نشانگر پیام جدید را نمایش دهیم
            showNewMessagesIndicator();
        }
    }
    
    // نمایش نشانگر پیام‌های جدید
    function showNewMessagesIndicator() {
        hasNewMessages = true;
        newMessagesIndicator.classList.add('active');
    }
    
    // مخفی کردن نشانگر پیام‌های جدید
    function hideNewMessagesIndicator() {
        hasNewMessages = false;
        newMessagesIndicator.classList.remove('active');
    }

    // بارگیری تاریخچه چت
    function loadChatHistory() {
        try {
            const savedMessages = localStorage.getItem(STORAGE_CHAT_MESSAGES);
            if (savedMessages) {
                const messages = JSON.parse(savedMessages);
                
                messages.forEach(msg => {
                    const messageElement = document.createElement('div');
                    messageElement.className = `message ${msg.type}-message`;
                    
                    const nameElement = document.createElement('strong');
                    nameElement.textContent = msg.sender;
                    
                    const contentElement = document.createElement('div');
                    contentElement.className = 'message-content markdown-content';
                    contentElement.innerHTML = msg.content;
                    
                    messageElement.appendChild(nameElement);
                    messageElement.appendChild(contentElement);
                    chatMessages.appendChild(messageElement);
                });
                
                // اسکرول به انتهای چت
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } catch (error) {
            console.error('خطا در بارگیری تاریخچه چت:', error);
        }
    }

    // بارگیری اطلاعات فایل ذخیره شده
    function loadFileInfo() {
        try {
            const savedFileInfo = localStorage.getItem(STORAGE_FILE_INFO);
            if (savedFileInfo) {
                fileDetails = JSON.parse(savedFileInfo);
                
                if (fileDetails) {
                    fileContent = fileDetails.content;
                    fileName.textContent = fileDetails.displayName;
                    addMessage('سیستم', `فایل "${fileDetails.displayName}" بازیابی شد.`, 'bot', true, true);
                }
            }
        } catch (error) {
            console.error('خطا در بارگیری اطلاعات فایل:', error);
        }
    }

    // ذخیره پیام‌های چت
    function saveChatMessages() {
        try {
            // محدود کردن تعداد پیام‌ها به 100 پیام آخر برای جلوگیری از پر شدن localStorage
            const maxMessages = 100;
            
            const messages = [];
            const messageElements = chatMessages.querySelectorAll('.message');
            
            // اگر تعداد پیام‌ها زیاد است، فقط 100 پیام آخر را ذخیره کنیم
            const startIndex = messageElements.length > maxMessages ? messageElements.length - maxMessages : 0;
            
            for (let i = startIndex; i < messageElements.length; i++) {
                const element = messageElements[i];
                const isUserMessage = element.classList.contains('user-message');
                
                const senderElement = element.querySelector('strong');
                const contentElement = element.querySelector('.message-content');
                
                if (senderElement && contentElement) {
                    messages.push({
                        sender: senderElement.textContent,
                        content: contentElement.innerHTML,
                        type: isUserMessage ? 'user' : 'bot'
                    });
                }
            }
            
            localStorage.setItem(STORAGE_CHAT_MESSAGES, JSON.stringify(messages));
        } catch (error) {
            console.error('خطا در ذخیره پیام‌های چت:', error);
        }
    }

    // ذخیره اطلاعات فایل
    function saveFileInfo(file, fileType, displayName, content) {
        try {
            const fileInfo = {
                name: file ? file.name : '',
                type: fileType,
                displayName: displayName,
                content: content,
                date: new Date().toISOString()
            };
            
            localStorage.setItem(STORAGE_FILE_INFO, JSON.stringify(fileInfo));
            fileDetails = fileInfo;
        } catch (error) {
            console.error('خطا در ذخیره اطلاعات فایل:', error);
        }
    }

    function addRichMessage(sender, htmlContent, type, save = true) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}-message`;
        
        const nameElement = document.createElement('strong');
        nameElement.textContent = sender;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content markdown-content';
        contentElement.innerHTML = htmlContent;
        
        // ذخیره وضعیت اسکرول کاربر
        userWasAtBottom = isScrolledToBottom();
        
        messageElement.appendChild(nameElement);
        messageElement.appendChild(contentElement);
        chatMessages.appendChild(messageElement);
        
        // اسکرول به پایین اگر کاربر در پایین بود
        scrollToBottomIfNeeded();
        
        // ذخیره پیام‌ها اگر نیاز است
        if (save) {
            saveChatMessages();
        }
        
        return messageElement.id;
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        if (!isConnected) {
            addMessage('سیستم', 'لطفاً ابتدا به OpenRouter متصل شوید.', 'bot', true, true);
            return;
        }
        
        if (!fileContent) {
            addMessage('سیستم', 'لطفاً ابتدا یک فایل انتخاب کنید.', 'bot', true, true);
            return;
        }
        
        // نمایش پیام کاربر
        addMessage('شما', message, 'user');
        
        // پاک کردن فیلد ورودی
        userInput.value = '';
        
        // غیرفعال کردن دکمه ارسال
        sendButton.disabled = true;
        
        // ایجاد یک پیام در حال ارسال
        const responseMessageId = createStreamingMessage('هوش مصنوعی', 'در حال تحلیل...', 'bot');
        
        try {
            // ارسال به API
            await sendToOpenRouterWithStreaming(message, fileContent, responseMessageId);
        } catch (error) {
            console.error('خطا در ارسال پیام:', error);
            // حذف پیام در حال پردازش و نمایش خطا
            document.getElementById(responseMessageId).remove();
            addMessage('سیستم', `خطا در دریافت پاسخ: ${error.message}`, 'bot', true, true);
        } finally {
            // فعال کردن دکمه ارسال
            sendButton.disabled = false;
        }
    }

    function createStreamingMessage(sender, initialText, type) {
        // ایجاد شناسه منحصر به فرد
        const messageId = 'msg-' + Date.now();
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}-message streaming-message`;
        messageElement.id = messageId;
        
        const nameElement = document.createElement('strong');
        nameElement.textContent = sender;
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'streaming-content-container';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'streaming-content';
        contentElement.textContent = initialText;
        
        // ذخیره وضعیت اسکرول کاربر
        userWasAtBottom = isScrolledToBottom();
        
        contentContainer.appendChild(contentElement);
        messageElement.appendChild(nameElement);
        messageElement.appendChild(contentContainer);
        chatMessages.appendChild(messageElement);
        
        // اسکرول به پایین اگر کاربر در پایین بود
        scrollToBottomIfNeeded();
        
        return messageId;
    }

    function updateStreamingMessage(messageId, text) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        const contentElement = messageElement.querySelector('.streaming-content');
        if (contentElement) {
            contentElement.textContent = text;
            
            // اسکرول به پایین اگر کاربر در پایین بود
            scrollToBottomIfNeeded();
        }
    }
    
    function finalizeStreamingMessage(messageId, htmlContent) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        // حذف کلاس streaming-message
        messageElement.classList.remove('streaming-message');
        
        const contentContainer = messageElement.querySelector('.streaming-content-container');
        if (contentContainer) {
            // جایگزینی محتوا با HTML پردازش شده
            contentContainer.innerHTML = '';
            
            const newContentElement = document.createElement('div');
            newContentElement.className = 'message-content markdown-content';
            newContentElement.innerHTML = htmlContent;
            
            contentContainer.appendChild(newContentElement);
            
            // اسکرول به پایین اگر کاربر در پایین بود
            scrollToBottomIfNeeded();
            
            // ذخیره پیام‌ها
            saveChatMessages();
        }
    }

    function preprocessMarkdown(text) {
        // تبدیل متن به HTML با استفاده از marked
        let html = marked.parse(text);
        
        // اطمینان از راست-به-چپ بودن HTML ایجاد شده
        html = html.replace(/<p>/g, '<p dir="rtl">');
        html = html.replace(/<ul>/g, '<ul dir="rtl">');
        html = html.replace(/<ol>/g, '<ol dir="rtl">');
        html = html.replace(/<blockquote>/g, '<blockquote dir="rtl">');
        
        return html;
    }

    function addMessage(sender, text, type, save = true, scroll = true) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}-message`;
        
        const nameElement = document.createElement('strong');
        nameElement.textContent = sender;
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content markdown-content';
        
        // تبدیل متن به HTML با استفاده از تابع preprocessMarkdown
        contentElement.innerHTML = preprocessMarkdown(text);
        
        // ذخیره وضعیت اسکرول کاربر
        if (scroll) {
            userWasAtBottom = isScrolledToBottom();
        }
        
        messageElement.appendChild(nameElement);
        messageElement.appendChild(contentElement);
        chatMessages.appendChild(messageElement);
        
        // اسکرول به پایین اگر کاربر در پایین بود یا اسکرول درخواست شده
        if (scroll) {
            scrollToBottomIfNeeded();
        }
        
        // ذخیره پیام‌ها اگر نیاز است
        if (save) {
            saveChatMessages();
        }
        
        return messageElement.id;
    }

    async function readFileContent(file) {
        const fileType = file.name.split('.').pop().toLowerCase();
        let content = '';
        let displayName = file.name;
        
        try {
            if (fileType === 'pdf') {
                // خواندن فایل PDF
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                
                const totalPages = pdf.numPages;
                let extractedText = '';
                
                // استخراج متن از همه صفحات
                for (let i = 1; i <= totalPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    extractedText += `[صفحه ${i}/${totalPages}]\n${pageText}\n\n`;
                }
                
                content = extractedText;
            } else if (fileType === 'docx') {
                // خواندن فایل DOCX
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer });
                content = result.value;
            } else if (fileType === 'doc') {
                // فایل‌های DOC به طور مستقیم پشتیبانی نمی‌شوند
                throw new Error('فایل‌های DOC مستقیماً پشتیبانی نمی‌شوند. لطفاً آن را به DOCX یا PDF تبدیل کنید.');
            } else if (fileType === 'txt') {
                // خواندن فایل TXT
                content = await file.text();
            } else {
                throw new Error('نوع فایل پشتیبانی نمی‌شود. لطفاً از PDF، DOCX یا TXT استفاده کنید.');
            }
            
            // ذخیره اطلاعات فایل
            saveFileInfo(file, fileType, displayName, content);
            
            return {
                content,
                fileType,
                displayName
            };
        } catch (error) {
            console.error('خطا در خواندن فایل:', error);
            throw error;
        }
    }

    async function sendToOpenRouterWithStreaming(message, context, responseMessageId) {
        if (!API_KEY || !selectedModel) {
            throw new Error('کلید API یا مدل انتخاب نشده است.');
        }
        
        // ساخت context بر اساس فایل
        let fileContext = '';
        if (fileDetails) {
            fileContext = `محتوای فایل "${fileDetails.displayName}" که کاربر آپلود کرده است:\n\n${context}\n\n`;
        }
        
        // ساخت پیام‌ها برای API
        const messages = [
            {
                role: 'system',
                content: `شما یک دستیار هوشمند متخصص در تحلیل، پاسخگویی به سوالات و خلاصه‌سازی اسناد هستید. محتوای فایل زیر برای شما ارائه شده است. هنگام پاسخ، از متن سند استفاده کنید. اگر اطلاعات در سند وجود ندارد، صادقانه بگویید. پاسخ‌های خود را به فارسی و در قالب مارک‌داون ارائه دهید.\n\n${fileContext}`
            },
            {
                role: 'user',
                content: message
            }
        ];
        
        try {
            console.log('درخواست به OpenRouter ارسال شد:', selectedModel);
            updateStreamingMessage(responseMessageId, 'در حال ارسال درخواست...');
            
            // ابتدا سعی می‌کنیم با روش غیر استریم (برای اطمینان از دریافت پاسخ)
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'PDF Document QA System'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: messages,
                    stream: false,
                    max_tokens: 500
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
                console.error('خطا در پاسخ OpenRouter:', errorData);
                throw new Error(errorData.error?.message || 'خطا در دریافت پاسخ');
            }
            
            console.log('پاسخ از OpenRouter دریافت شد');
            updateStreamingMessage(responseMessageId, 'در حال پردازش پاسخ...');
            
            const data = await response.json();
            console.log('پاسخ دریافت شده:', data);
            
            // استخراج متن پاسخ
            let responseText = '';
            
            if (data.choices && data.choices.length > 0) {
                if (data.choices[0].message && data.choices[0].message.content) {
                    responseText = data.choices[0].message.content;
                } else if (data.choices[0].text) {
                    responseText = data.choices[0].text;
                }
            }
            
            if (!responseText && data.output) {
                responseText = data.output;
            }
            
            if (!responseText && data.content) {
                responseText = data.content;
            }
            
            if (!responseText && data.message) {
                responseText = data.message.content || data.message;
            }
            
            console.log('متن استخراج شده از پاسخ:', responseText);
            
            if (!responseText) {
                console.warn('استخراج متن از پاسخ ناموفق بود. کل داده دریافتی:', data);
                // تلاش برای بررسی ساختارهای احتمالی دیگر
                responseText = JSON.stringify(data);
                try {
                    if (typeof data === 'object') {
                        // تلاش برای پیدا کردن اولین رشته طولانی در پاسخ
                        const findStringValues = (obj, maxDepth = 3, currentDepth = 0) => {
                            if (currentDepth > maxDepth) return [];
                            if (!obj || typeof obj !== 'object') return [];
                            
                            let results = [];
                            for (const key in obj) {
                                const value = obj[key];
                                if (typeof value === 'string' && value.length > 50) {
                                    results.push(value);
                                } else if (typeof value === 'object' && value !== null) {
                                    results = results.concat(findStringValues(value, maxDepth, currentDepth + 1));
                                }
                            }
                            return results;
                        };
                        
                        const stringValues = findStringValues(data);
                        if (stringValues.length > 0) {
                            responseText = stringValues[0];
                        }
                    }
                } catch (e) {
                    console.error('خطا در تلاش نهایی برای استخراج متن:', e);
                }
            }
            
            if (!responseText) {
                responseText = 'متأسفانه پاسخی از هوش مصنوعی دریافت نشد. لطفاً با مدل دیگری امتحان کنید.';
            }
            
            // تبدیل متن نهایی به مارک‌داون
            const finalHTML = preprocessMarkdown(responseText);
            finalizeStreamingMessage(responseMessageId, finalHTML);
            
        } catch (error) {
            console.error('خطا در ارسال به OpenRouter:', error);
            throw error;
        }
    }

    // رویدادها
    sendButton.addEventListener('click', sendMessage);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    fileInput.addEventListener('change', async (e) => {
        try {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                fileName.textContent = `در حال پردازش ${file.name}...`;
                
                // خواندن محتوای فایل
                const result = await readFileContent(file);
                
                // آپدیت UI
                fileName.textContent = result.displayName;
                fileContent = result.content;
                currentFile = file;
                
                // اضافه کردن پیام سیستمی
                addMessage('سیستم', `فایل "${result.displayName}" با موفقیت بارگذاری شد.`, 'bot', true, true);
            }
        } catch (error) {
            fileName.textContent = '';
            addMessage('سیستم', `خطا: ${error.message}`, 'bot', true, true);
        }
    });
    
    // مدیریت رویداد اسکرول برای مخفی کردن نشانگر پیام جدید
    chatMessages.addEventListener('scroll', () => {
        if (isScrolledToBottom() && hasNewMessages) {
            hideNewMessagesIndicator();
        }
    });
    
    // کلیک روی نشانگر پیام جدید
    newMessagesIndicator.addEventListener('click', () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        hideNewMessagesIndicator();
    });
}); 
