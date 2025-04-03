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
    const maxTokensInput = document.getElementById('maxTokensInput');
    const chatGuide = document.getElementById('chatGuide');
    
    let currentFile = null;
    let fileContent = '';
    let isConnected = false;
    let connectionCheckInterval = null;
    let activeResponse = null; // برای نگهداری پاسخ فعلی در حالت streaming
    let fileDetails = null; // برای ذخیره جزئیات فایل
    let userWasAtBottom = true; // آیا کاربر در انتهای چت بوده است
    let hasNewMessages = false; // آیا پیام جدیدی دریافت شده است
    let maxTokens = 500; // مقدار پیش‌فرض برای حداکثر توکن
    let hasStartedChat = false; // آیا گفتگو شروع شده است

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
    const STORAGE_MAX_TOKENS = 'pdf_online_max_tokens';

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
                            dir: 'rtl',
                            language: {
                                noResults: function() {
                                    return "نتیجه‌ای یافت نشد";
                                },
                                searching: function() {
                                    return "در حال جستجو...";
                                }
                            },
                            width: '100%',
                            dropdownCssClass: 'api-select-dropdown'
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
        const tokens = maxTokensInput.value ? parseInt(maxTokensInput.value) : 500;
        
        if (!apiKey) {
            addMessage('سیستم', 'لطفاً یک کلید API معتبر وارد کنید.', 'bot', true, true);
            return;
        }
        
        if (!model) {
            addMessage('سیستم', 'لطفاً یک مدل را انتخاب کنید.', 'bot', true, true);
            return;
        }
        
        // محدود کردن مقدار توکن به محدوده مناسب
        if (tokens < 100) {
            maxTokens = 100;
        } else if (tokens > 4000) {
            maxTokens = 4000;
        } else {
            maxTokens = tokens;
        }
        
        // ذخیره تنظیمات
        localStorage.setItem(STORAGE_API_KEY, apiKey);
        localStorage.setItem(STORAGE_MODEL, model);
        localStorage.setItem(STORAGE_MAX_TOKENS, maxTokens);
        
        API_KEY = apiKey;
        selectedModel = model;
        
        // نمایش مقدار توکن در فیلد ورودی
        maxTokensInput.value = maxTokens;
        
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
        const savedMaxTokens = localStorage.getItem(STORAGE_MAX_TOKENS);
        
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
            API_KEY = savedApiKey;
        }
        
        if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
            modelSelect.value = savedModel;
            selectedModel = savedModel;
        }
        
        if (savedMaxTokens) {
            const tokens = parseInt(savedMaxTokens);
            maxTokens = tokens;
            maxTokensInput.value = tokens;
        } else {
            // مقدار پیش‌فرض
            maxTokensInput.value = maxTokens;
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
        
        // بازگرداندن راهنما
        chatGuide.classList.remove('hidden');
        hasStartedChat = false;
        
        // افزودن مجدد راهنما به کادر گفتگو
        const guideElement = document.createElement('div');
        guideElement.className = 'chat-guide';
        guideElement.id = 'chatGuide';
        
        guideElement.innerHTML = `
            <div class="chat-guide-content">
                <div class="chat-guide-icon">💬</div>
                <div class="chat-guide-text">فایل مورد نظر خود را بارگذاری کنید و سپس سؤال خود را بپرسید.</div>
                <div class="chat-guide-text">می‌توانید درباره محتوای سند سؤال کنید یا درخواست خلاصه‌سازی نمایید.</div>
            </div>
        `;
        
        chatMessages.appendChild(guideElement);
        
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
                
                // اگر پیام‌های قبلی وجود دارد، راهنما را مخفی کن
                // بررسی کن که آیا پیام‌های غیر سیستمی وجود دارند
                const nonSystemMessages = messages.filter(msg => msg.sender !== 'سیستم');
                if (nonSystemMessages.length > 0 && chatGuide) {
                    chatGuide.classList.add('hidden');
                    hasStartedChat = true;
                } else if (messages.length === 0 || nonSystemMessages.length === 0) {
                    // اگر پیامی وجود ندارد یا فقط پیام‌های سیستمی هستند، راهنما را نمایش بده
                    chatGuide.classList.remove('hidden');
                    hasStartedChat = false;
                }
                
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
        
        // اگر پیام کاربر معتبر است، راهنما را مخفی کن
        if (chatGuide) {
            chatGuide.classList.add('hidden');
            hasStartedChat = true;
        }
        
        // نمایش پیام کاربر
        addMessage('شما', message, 'user');
        
        // پاک کردن فیلد ورودی
        userInput.value = '';
        
        // غیرفعال کردن دکمه ارسال
        sendButton.disabled = true;
        
        try {
            // نمایش پاسخ با افکت تایپ زنده
            await processQuery(message);
        } catch (error) {
            console.error('خطا در ارسال پیام:', error);
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
    
    function finalizeStreamingMessage(messageId, finalHTML) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        // حذف پیام استریمینگ
        messageElement.remove();
        
        // ایجاد یک پیام معمولی
        addRichMessage('هوش مصنوعی', finalHTML, 'bot', true);
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

    // تابع نمایش نوتیفیکیشن سیستم
    function showNotification(message, type = 'info') {
        const notification = document.getElementById('systemNotification');
        const content = notification.querySelector('.notification-content');
        
        // پاک کردن کلاس‌های قبلی
        notification.classList.remove('notification-success', 'notification-error', 'notification-info');
        
        // تنظیم پیام و نوع نوتیفیکیشن
        content.textContent = message;
        notification.classList.add(`notification-${type}`);
        
        // نمایش نوتیفیکیشن
        notification.classList.add('show');
        
        // تایمر برای مخفی کردن نوتیفیکیشن بعد از 3 ثانیه
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // جایگزینی تابع فعلی addMessage با بررسی پیام‌های سیستمی
    function addMessage(sender, text, type, save = true, scroll = true) {
        // بررسی اگر پیام از نوع سیستمی است و باید به صورت نوتیفیکیشن نمایش داده شود
        if (sender === 'سیستم') {
            // تعیین نوع نوتیفیکیشن بر اساس محتوای پیام
            let notificationType = 'info';
            
            if (text.includes('موفقیت') || 
                text.includes('ذخیره شد') || 
                text.includes('متصل شد') || 
                text.includes('بارگذاری شد')) {
                notificationType = 'success';
            } else if (text.includes('خطا') || 
                      text.includes('قطع') || 
                      text.includes('نشد')) {
                notificationType = 'error';
            }
            
            // نمایش پیام به صورت نوتیفیکیشن
            showNotification(text, notificationType);
            
            // ذخیره در localStorage اگر لازم است
            if (save) {
                saveChatMessages();
            }
            
            return null;
        }
        
        // اگر پیام کاربر یا هوش مصنوعی است (نه سیستم)، راهنما را مخفی کن
        if ((sender === 'شما' || sender === 'هوش مصنوعی') && chatGuide) {
            chatGuide.classList.add('hidden');
            hasStartedChat = true;
        }
        
        // برای سایر پیام‌ها از روش قبلی استفاده کنیم
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
            } else if (fileType === 'jpg' || fileType === 'jpeg' || fileType === 'png') {
                // استفاده از OCR برای تصاویر
                addMessage('سیستم', 'در حال استخراج متن از تصویر با OCR... (این فرآیند ممکن است چند لحظه طول بکشد)', 'bot', true, true);
                
                // آماده‌سازی برای OCR
                const imageUrl = URL.createObjectURL(file);
                
                try {
                    // بارگذاری زبان فارسی اگر موجود نیست
                    await Tesseract.recognize(
                        imageUrl,
                        'fas', // زبان فارسی
                        {
                            logger: status => {
                                if (status.status === 'recognizing text') {
                                    addMessage('سیستم', `استخراج متن: ${Math.floor(status.progress * 100)}%`, 'bot', false, true);
                                }
                            }
                        }
                    ).then(result => {
                        content = result.data.text;
                    });
                    
                    // اگر متن فارسی استخراج نشد، با زبان انگلیسی امتحان کنیم
                    if (!content || content.trim().length < 10) {
                        addMessage('سیستم', 'استخراج متن فارسی با مشکل مواجه شد. در حال تلاش با زبان انگلیسی...', 'bot', true, true);
                        await Tesseract.recognize(
                            imageUrl,
                            'eng', // زبان انگلیسی
                            {
                                logger: status => {
                                    if (status.status === 'recognizing text') {
                                        addMessage('سیستم', `استخراج متن: ${Math.floor(status.progress * 100)}%`, 'bot', false, true);
                                    }
                                }
                            }
                        ).then(result => {
                            content = result.data.text;
                        });
                    }
                    
                    // پاکسازی متن استخراج شده
                    if (content) {
                        // حذف خطوط خالی اضافی
                        content = content.replace(/\n{3,}/g, '\n\n');
                        // مرتب‌سازی متن و بهبود خوانایی
                        content = `[متن استخراج شده از تصویر "${displayName}"]\n\n${content}`;
                    } else {
                        content = `[متن قابل استخراج نبود. هوش مصنوعی می‌تواند تصویر را تحلیل کند.]`;
                    }
                    
                    // آزاد کردن URL تصویر
                    URL.revokeObjectURL(imageUrl);
                    
                } catch (ocrError) {
                    console.error('خطا در OCR:', ocrError);
                    throw new Error('استخراج متن از تصویر با خطا مواجه شد: ' + ocrError.message);
                }
            } else {
                throw new Error('نوع فایل پشتیبانی نمی‌شود. لطفاً از PDF، DOCX، TXT یا تصاویر (JPG، PNG) استفاده کنید.');
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
        
        // بررسی اینکه آیا فایل تصویری است
        const isImageFile = currentFile && ['jpg', 'jpeg', 'png'].includes(currentFile.name.split('.').pop().toLowerCase());
        
        // بررسی اینکه آیا مدل انتخابی قابلیت پردازش تصویر دارد
        const hasVisionCapability = checkModelHasVisionCapability(selectedModel);
        
        // ساخت پیام‌ها برای API
        let messages = [];
        
        // اگر فایل تصویری است و مدل قابلیت پردازش تصویر دارد
        if (isImageFile && hasVisionCapability) {
            try {
                // تبدیل تصویر به base64
                const imageBase64 = await fileToBase64(currentFile);
                
                messages = [
                    {
                        role: 'system',
                        content: 'شما یک دستیار هوشمند متخصص در تحلیل تصاویر هستید. تصویری که کاربر آپلود کرده است را تحلیل کنید. این تصویر ممکن است شامل متن، اشکال، یا محتوای دیگری باشد. لطفاً آنچه در تصویر می‌بینید را توضیح دهید و به سؤال کاربر با دقت پاسخ دهید. پاسخ‌های خود را به فارسی و در قالب مارک‌داون ارائه دهید.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: message
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageBase64
                                }
                            }
                        ]
                    }
                ];
                
                updateStreamingMessage(responseMessageId, 'در حال تحلیل تصویر...');
            } catch (error) {
                console.error('خطا در تبدیل تصویر به base64:', error);
                // در صورت خطا، از متن استخراج شده استفاده می‌کنیم
                messages = [
                    {
                        role: 'system',
                        content: `شما یک دستیار هوشمند متخصص در تحلیل، پاسخگویی به سوالات و خلاصه‌سازی اسناد هستید. محتوای فایل زیر برای شما ارائه شده است. هنگام پاسخ، از متن سند استفاده کنید. اگر اطلاعات در سند وجود ندارد، صادقانه بگویید. پاسخ‌های خود را به فارسی و در قالب مارک‌داون ارائه دهید.\n\n${fileContext}`
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ];
            }
        } else if (isImageFile && !hasVisionCapability) {
            // اگر فایل تصویری است اما مدل قابلیت پردازش تصویر ندارد
            updateStreamingMessage(responseMessageId, 'مدل انتخابی قابلیت پردازش تصویر ندارد، از متن استخراج شده استفاده می‌شود...');
            
            messages = [
                {
                    role: 'system',
                    content: `شما یک دستیار هوشمند متخصص در تحلیل، پاسخگویی به سوالات و خلاصه‌سازی اسناد هستید. محتوای فایل زیر برای شما ارائه شده است که با OCR از یک تصویر استخراج شده است. توجه داشته باشید که ممکن است OCR کامل نباشد. هنگام پاسخ، از متن استخراج شده استفاده کنید. اگر اطلاعات کافی نیست، صادقانه بگویید. پاسخ‌های خود را به فارسی و در قالب مارک‌داون ارائه دهید.\n\n${fileContext}`
                },
                {
                    role: 'user',
                    content: message
                }
            ];
        } else {
            // برای فایل‌های غیر تصویری یا حالت عادی
            messages = [
                {
                    role: 'system',
                    content: `شما یک دستیار هوشمند متخصص در تحلیل، پاسخگویی به سوالات و خلاصه‌سازی اسناد هستید. محتوای فایل زیر برای شما ارائه شده است. هنگام پاسخ، از متن سند استفاده کنید. اگر اطلاعات در سند وجود ندارد، صادقانه بگویید. پاسخ‌های خود را به فارسی و در قالب مارک‌داون ارائه دهید.\n\n${fileContext}`
                },
                {
                    role: 'user',
                    content: message
                }
            ];
        }
        
        try {
            console.log('درخواست به OpenRouter ارسال شد:', selectedModel);
            updateStreamingMessage(responseMessageId, 'در حال ارسال درخواست...');
            
            // تنظیم پارامترهای درخواست
            const requestBody = {
                model: selectedModel,
                messages: messages,
                stream: false,
                max_tokens: maxTokens
            };
            
            // ابتدا سعی می‌کنیم با روش غیر استریم (برای اطمینان از دریافت پاسخ)
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'PDF Document QA System'
                },
                body: JSON.stringify(requestBody)
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
            
            // نمایش متن با افکت تایپ زنده
            await typeText(responseText, responseMessageId);
            
            // تبدیل متن نهایی به مارک‌داون
            const finalHTML = preprocessMarkdown(responseText);
            finalizeStreamingMessage(responseMessageId, finalHTML);
            
        } catch (error) {
            console.error('خطا در ارسال به OpenRouter:', error);
            throw error;
        }
    }
    
    // تبدیل فایل به base64
    async function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
    
    // بررسی اینکه آیا مدل انتخابی قابلیت پردازش تصویر دارد
    function checkModelHasVisionCapability(modelId) {
        // لیست مدل‌هایی که قابلیت پردازش تصویر دارند
        const visionModels = [
            'anthropic/claude-3-opus-20240229',
            'anthropic/claude-3-sonnet-20240229',
            'anthropic/claude-3-haiku-20240307',
            'openai/gpt-4-vision',
            'openai/gpt-4o',
            'openai/gpt-4-turbo',
            'gemini/pro-vision'
        ];
        
        return visionModels.some(model => modelId.includes(model));
    }

    // تابع تایپ زنده متن
    async function typeText(text, messageId) {
        let currentText = '';
        const words = text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            currentText += words[i] + ' ';
            updateStreamingMessage(messageId, currentText);
            
            // تاخیر تصادفی بین 5 تا 30 میلی‌ثانیه برای واقعی‌تر شدن تایپ
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 25) + 5));
            
            // هر چند کلمه یک اسکرول به پایین انجام شود
            if (i % 3 === 0) {
                scrollToBottomIfNeeded();
            }
        }
        
        return currentText;
    }
    
    async function processQuery(message) {
        try {
            // ایجاد پیام در حال تایپ
            const messageId = createStreamingMessage('هوش مصنوعی', 'در حال تحلیل...', 'bot');
            
            // ارسال درخواست به OpenRouter
            await sendToOpenRouterWithStreaming(message, fileContent, messageId);
            
            return true;
        } catch (error) {
            console.error('خطا در پردازش درخواست:', error);
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

    // ماژول آزمون چندگزینه‌ای
    // این بخش به صورت مستقل با بقیه کد کار می‌کند
    (function initQuizModule() {
        console.log('شروع بارگذاری ماژول آزمون');
        
        // المان‌های DOM - بصورت مستقیم انتخاب می‌شوند
        const quizSection = document.querySelector('.quiz-section');
        if (!quizSection) {
            console.error('بخش آزمون در HTML یافت نشد');
            return; // خروج از ماژول
        }
        
        const quizTabButtons = document.querySelectorAll('.quiz-tab');
        const quizPanels = document.querySelectorAll('.quiz-panel');
        const quizBuilderPanel = document.getElementById('quizBuilderPanel');
        const quizTakerPanel = document.getElementById('quizTakerPanel');
        const quizResultsPanel = document.getElementById('quizResultsPanel');
        
        // دکمه‌های تب
        const showQuizBuilderBtn = document.getElementById('showQuizBuilder');
        const showQuizTakerBtn = document.getElementById('showQuizTaker');
        const showQuizResultsBtn = document.getElementById('showQuizResults');
        
        // سایر عناصر
        const generateQuizBtn = document.getElementById('generateQuiz');
        const submitQuizBtn = document.getElementById('submitQuiz');
        const clearQuizBtn = document.getElementById('clearQuiz');
        const newQuizBtn = document.getElementById('newQuizButton');
        
        // ورودی‌ها
        const quizPromptInput = document.getElementById('quizPrompt');
        const questionCountInput = document.getElementById('questionCount');
        const quizTypeSelect = document.getElementById('quizType');
        const quizDifficultySelect = document.getElementById('quizDifficulty');
        
        // کانتینرها
        const quizQuestionsContainer = document.getElementById('quizQuestions');
        const quizLoading = document.getElementById('quizLoading');
        const quizResultDetails = document.getElementById('quizResultDetails');
        const quizScoreDisplay = document.getElementById('quizScore');
        
        console.log('عناصر آزمون پیدا شدند. تعداد تب‌ها:', quizTabButtons.length, 'تعداد پنل‌ها:', quizPanels.length);
        
        // متغیرهای جهانی ماژول
        let currentQuiz = null; // برای نگهداری سوالات فعلی
        let userAnswers = {}; // برای نگهداری پاسخ‌های کاربر
        
        // بارگذاری اولیه آزمون از localStorage
        function loadQuizState() {
            try {
                const savedQuiz = localStorage.getItem('currentQuiz');
                const savedAnswers = localStorage.getItem('userAnswers');
                
                if (savedQuiz) {
                    currentQuiz = JSON.parse(savedQuiz);
                    console.log('آزمون از حافظه محلی بارگذاری شد:', currentQuiz.title);
                }
                
                if (savedAnswers) {
                    userAnswers = JSON.parse(savedAnswers);
                    console.log('پاسخ‌های کاربر از حافظه محلی بارگذاری شد');
                }
                
                // نمایش آزمون بارگذاری شده اگر موجود باشد
                if (currentQuiz && currentQuiz.questions && currentQuiz.questions.length > 0) {
                    // آزمون قبلی یافت شد
                    renderQuizQuestions(currentQuiz);
                    activateTab('taker');
                    showNotification('آزمون قبلی بازیابی شد', 'info');
                }
            } catch (error) {
                console.error('خطا در بارگذاری وضعیت آزمون:', error);
                // پاک کردن داده‌های ذخیره شده احتمالی خراب
                localStorage.removeItem('currentQuiz');
                localStorage.removeItem('userAnswers');
            }
        }
        
        // ذخیره آزمون و پاسخ‌ها در localStorage
        function saveQuizState() {
            try {
                console.log('ذخیره وضعیت آزمون در localStorage');
                
                // بررسی وجود آزمون معتبر
                let quiz = null;
                let userAns = {};
                
                // بررسی در متغیرهای مختلف
                if (typeof quizModule !== 'undefined' && quizModule && quizModule.currentQuiz) {
                    quiz = quizModule.currentQuiz;
                    if (quizModule.userAnswers) {
                        userAns = quizModule.userAnswers;
                    }
                }
                
                if (!quiz && typeof window.currentQuiz !== 'undefined' && window.currentQuiz) {
                    quiz = window.currentQuiz;
                    if (window.userAnswers) {
                        userAns = window.userAnswers;
                    }
                }
                
                if (!quiz && typeof currentQuiz !== 'undefined' && currentQuiz) {
                    quiz = currentQuiz;
                    if (typeof userAnswers !== 'undefined' && userAnswers) {
                        userAns = userAnswers;
                    }
                }
                
                if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                    console.warn('آزمون معتبری برای ذخیره در localStorage یافت نشد');
                    return false;
                }
                
                // ایجاد یک نسخه عمیق از آزمون برای ذخیره
                const quizToSave = JSON.parse(JSON.stringify(quiz));
                
                // ذخیره در localStorage
                const stateToSave = {
                    quiz: quizToSave,
                    userAnswers: userAns,
                    timestamp: new Date().toISOString()
                };
                
                localStorage.setItem('quizState', JSON.stringify(stateToSave));
                console.log('وضعیت آزمون با موفقیت در localStorage ذخیره شد');
                
                return true;
            } catch (error) {
                console.error('خطا در ذخیره وضعیت آزمون:', error);
                return false;
            }
        }
        
        // پاک کردن وضعیت آزمون
        function clearQuizState() {
            localStorage.removeItem('currentQuiz');
            localStorage.removeItem('userAnswers');
            currentQuiz = null;
            userAnswers = {};
            console.log('وضعیت آزمون پاک شد');
        }

        // تابع مستقیم برای تغییر بین تب‌ها
        function activateTab(tabName) {
            try {
                console.log(`فعال‌سازی تب: ${tabName}`);
                const tabs = document.querySelectorAll('.quiz-tab');
                const panels = document.querySelectorAll('.quiz-panel');
                
                // غیرفعال کردن همه تب‌ها و پنل‌ها
                tabs.forEach(tab => tab.classList.remove('active'));
                panels.forEach(panel => panel.classList.remove('active'));
                
                // فعال‌سازی تب و پنل مورد نظر
                switch(tabName) {
                    case 'builder':
                        document.getElementById('showQuizBuilder').classList.add('active');
                        document.getElementById('quizBuilderPanel').classList.add('active');
                        break;
                    case 'taker':
                        document.getElementById('showQuizTaker').classList.add('active');
                        document.getElementById('quizTakerPanel').classList.add('active');
                        break;
                    case 'results':
                        document.getElementById('showQuizResults').classList.add('active');
                        document.getElementById('quizResultsPanel').classList.add('active');
                        break;
                    // حذف مورد 'history' از سوییچ
                }
                
                console.log(`تب ${tabName} با موفقیت فعال شد`);
            } catch (error) {
                console.error(`خطا در فعال‌سازی تب ${tabName}:`, error);
            }
        }
        
        // تنظیم رویدادهای کلیک برای تب‌ها
        if (showQuizBuilderBtn) {
            showQuizBuilderBtn.addEventListener('click', () => activateTab('builder'));
        }
        
        if (showQuizTakerBtn) {
            showQuizTakerBtn.addEventListener('click', () => activateTab('taker'));
        }
        
        if (showQuizResultsBtn) {
            showQuizResultsBtn.addEventListener('click', () => activateTab('results'));
        }
        
        // اجرای اولیه
        console.log('ماژول آزمون بارگذاری شد');
        
        // بارگذاری آزمون ذخیره شده قبلی
        loadQuizState();
        
        // فعال کردن تب اول در ابتدا (اگر آزمون قبلی بارگذاری نشده باشد)
        if (!currentQuiz) {
            activateTab('builder');
        }
        
        // رویداد دکمه ایجاد آزمون
        if (generateQuizBtn) {
            generateQuizBtn.addEventListener('click', async () => {
                console.log('دکمه ایجاد آزمون کلیک شد');
                
                if (!fileContent) {
                    console.warn('فایلی آپلود نشده است');
                    showNotification('لطفاً ابتدا یک فایل آپلود کنید.', 'error');
                    return;
                }
                
                if (!isConnected) {
                    console.warn('اتصال به API برقرار نیست');
                    showNotification('لطفاً ابتدا به OpenRouter متصل شوید.', 'error');
                    return;
                }
                
                // تغییر به تب آزمون‌دهی
                activateTab('taker');
                
                // فعال کردن صفحه لودینگ
                if (quizLoading) {
                    quizLoading.classList.add('active');
                }
                
                // پاک کردن سوالات قبلی
                if (quizQuestionsContainer) {
                    quizQuestionsContainer.innerHTML = '';
                }
                
                try {
                    // دریافت مقادیر از فرم
                    const prompt = quizPromptInput ? quizPromptInput.value : '';
                    const questionCount = questionCountInput ? parseInt(questionCountInput.value) || 5 : 5;
                    const quizType = quizTypeSelect ? quizTypeSelect.value : 'mixed';
                    const quizDifficulty = quizDifficultySelect ? quizDifficultySelect.value : 'mixed';
                    
                    // نمایش اعلان
                    showNotification('در حال ایجاد آزمون...', 'info');
                    
                    // ایجاد آزمون
                    const quiz = await generateQuizFromAI(prompt, questionCount, quizType, quizDifficulty);
                    
                    if (quiz && quiz.questions && quiz.questions.length > 0) {
                        // ذخیره آزمون فعلی
                        currentQuiz = quiz;
                        userAnswers = {}; // پاک کردن پاسخ‌های قبلی
                        
                        // نمایش سوالات
                        renderQuizQuestions(quiz);
                        
                        // ذخیره آزمون جدید
                        saveQuizState();
                        
                        showNotification(`آزمون با ${quiz.questions.length} سوال ایجاد شد.`, 'success');
                    } else {
                        showNotification('خطا در ایجاد آزمون: پاسخ دریافتی نامعتبر است.', 'error');
                        activateTab('builder');
                    }
                } catch (error) {
                    console.error('خطا در ایجاد آزمون:', error);
                    showNotification('خطا در ایجاد آزمون: ' + error.message, 'error');
                    activateTab('builder');
                } finally {
                    // غیرفعال کردن صفحه لودینگ
                    if (quizLoading) {
                        quizLoading.classList.remove('active');
                    }
                }
            });
        }
        
        // رویداد دکمه ثبت پاسخ‌ها
        if (submitQuizBtn) {
            submitQuizBtn.addEventListener('click', () => {
                if (!currentQuiz || !currentQuiz.questions || currentQuiz.questions.length === 0) {
                    showNotification('آزمونی برای ارزیابی وجود ندارد.', 'error');
                    return;
                }
                
                // ارزیابی پاسخ‌ها
                const result = evaluateQuizAnswers(currentQuiz, userAnswers);
                
                // نمایش نتایج
                renderQuizResults(result);
                
                // ذخیره وضعیت نهایی با پاسخ‌های کاربر
                saveQuizState();
                
                // تغییر به تب نتایج
                activateTab('results');
                
                showNotification(`نمره شما: ${result.correctCount} از ${result.totalQuestions}`, 'info');
            });
        }
        
        // رویداد دکمه پاک کردن پاسخ‌ها
        if (clearQuizBtn) {
            clearQuizBtn.addEventListener('click', () => {
                if (currentQuiz && currentQuiz.questions) {
                    userAnswers = {};
                    renderQuizQuestions(currentQuiz);
                    saveQuizState(); // ذخیره وضعیت جدید
                    showNotification('پاسخ‌های شما پاک شدند.', 'info');
                }
            });
        }
        
        // رویداد دکمه آزمون جدید
        if (newQuizBtn) {
            newQuizBtn.addEventListener('click', () => {
                // تغییر به تب طراحی آزمون
                activateTab('builder');
                // پیشنهاد پاک کردن آزمون قبلی با نمایش اعلان
                if (currentQuiz) {
                    if (confirm('آیا می‌خواهید آزمون فعلی را پاک کنید و آزمون جدیدی بسازید؟')) {
                        clearQuizState();
                        showNotification('آزمون پاک شد، می‌توانید آزمون جدیدی بسازید.', 'info');
                    }
                }
            });
        }
        
        // تابع ایجاد آزمون با استفاده از هوش مصنوعی
        async function generateQuizFromAI(prompt, questionCount, quizType, quizDifficulty) {
            // ساخت دستورالعمل برای هوش مصنوعی
            const systemPrompt = createSystemPrompt(questionCount, quizType, quizDifficulty);
            const userPrompt = createUserPrompt(prompt, questionCount, quizType, quizDifficulty);
            
            console.log('درخواست ایجاد آزمون با پارامترهای:', { questionCount, quizType, quizDifficulty });
            
            try {
                console.log('ارسال درخواست به OpenRouter...');
                
                // ساخت درخواست به OpenRouter
                const requestBody = {
                    model: selectedModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: false,
                    max_tokens: 3000,  // سوالات آزمون می‌تواند طولانی باشد
                    temperature: 0.7
                };
                
                console.log('درخواست API:', requestBody);
                
                // ارسال درخواست
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 ثانیه تایم‌اوت
                
                const response = await fetch(OPENROUTER_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`,
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'PDF Document QA System'
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ 
                        error: { message: `خطای HTTP: ${response.status} ${response.statusText}` } 
                    }));
                    console.error('خطا در پاسخ OpenRouter:', errorData);
                    throw new Error(errorData.error?.message || 'خطا در دریافت پاسخ از هوش مصنوعی');
                }
                
                console.log('پاسخ از OpenRouter دریافت شد');
                
                const data = await response.json();
                console.log('پاسخ دریافت شده از API:', data);
                
                let responseText = '';
                
                if (data.choices && data.choices.length > 0) {
                    if (data.choices[0].message && data.choices[0].message.content) {
                        responseText = data.choices[0].message.content;
                    } else if (data.choices[0].text) {
                        responseText = data.choices[0].text;
                    }
                }
                
                if (!responseText) {
                    if (data.output) {
                        responseText = data.output;
                    } else if (data.message) {
                        responseText = typeof data.message === 'string' ? data.message : 
                            (data.message.content || JSON.stringify(data.message));
                    } else if (data.response) {
                        responseText = data.response;
                    } else {
                        console.error('پاسخ متنی از API دریافت نشد:', data);
                        throw new Error('پاسخی از هوش مصنوعی دریافت نشد');
                    }
                }
                
                console.log('پاسخ متنی دریافت شده:', responseText.substring(0, 200) + '...');
                
                // تبدیل پاسخ به ساختار آزمون
                return parseAIResponseToQuiz(responseText);
                
            } catch (error) {
                console.error('خطا در دریافت آزمون از هوش مصنوعی:', error);
                if (error.name === 'AbortError') {
                    throw new Error('زمان درخواست به اتمام رسید. لطفاً مجدداً تلاش کنید.');
                }
                throw error;
            }
        }
        
        // ایجاد پرامپت سیستمی برای هوش مصنوعی
        function createSystemPrompt(questionCount, quizType, quizDifficulty) {
            return `شما یک سیستم طراحی آزمون هستید. وظیفه شما ایجاد آزمون از محتوای متنی است که کاربر ارائه می‌دهد.
             
            لطفاً آزمونی با ${questionCount} سوال از محتوای داده شده ایجاد کنید.
            نوع سوالات: ${getQuizTypeDescription(quizType)}
            سطح دشواری: ${getQuizDifficultyDescription(quizDifficulty)}
            
            پاسخ خود را به صورت JSON با ساختار زیر ارائه دهید:
            {
              "title": "عنوان آزمون",
              "questions": [
                {
                  "id": 1,
                  "type": "multichoice", // نوع سوال: "multichoice" یا "truefalse"
                  "text": "متن سوال",
                  "options": ["گزینه 1", "گزینه 2", "گزینه 3", "گزینه 4"], // برای سوالات چندگزینه‌ای
                  "answer": "گزینه صحیح", // متن گزینه صحیح برای چندگزینه‌ای یا "true"/"false" برای صحیح/غلط
                  "explanation": "توضیح چرایی پاسخ صحیح"
                }
              ]
            }
            
            مهم:
            1. فقط از محتوای ارائه شده استفاده کنید.
            2. اطمینان حاصل کنید که پاسخ‌های سوالات صحیح و مستقیماً از متن استخراج شده باشند.
            3. تنها خروجی JSON را بازگردانید، بدون هیچ متن اضافی.
            4. برای سوالات صحیح/غلط، گزینه‌ها نیاز نیست و پاسخ باید "true" یا "false" باشد.
            5. برای هر سوال حتماً توضیح کوتاهی درباره پاسخ صحیح ارائه دهید.
            `;
        }
        
        // ایجاد پرامپت کاربر برای هوش مصنوعی
        function createUserPrompt(prompt, questionCount, quizType, quizDifficulty) {
            return `${prompt ? prompt + '\n\n' : ''}لطفاً از متن زیر ${questionCount} سوال ${getQuizTypeDescription(quizType)} با سطح دشواری ${getQuizDifficultyDescription(quizDifficulty)} ایجاد کنید:
            
            ${fileContent}`;
        }
        
        // تبدیل نوع آزمون به توضیح
        function getQuizTypeDescription(quizType) {
            switch (quizType) {
                case 'multichoice': return 'چندگزینه‌ای';
                case 'truefalse': return 'صحیح/غلط';
                case 'mixed': default: return 'ترکیبی (چندگزینه‌ای و صحیح/غلط)';
            }
        }
        
        // تبدیل سطح دشواری به توضیح
        function getQuizDifficultyDescription(quizDifficulty) {
            switch (quizDifficulty) {
                case 'easy': return 'ساده';
                case 'medium': return 'متوسط';
                case 'hard': return 'دشوار';
                case 'mixed': default: return 'ترکیبی (ساده، متوسط و دشوار)';
            }
        }
        
        // تبدیل پاسخ هوش مصنوعی به ساختار آزمون
        function parseAIResponseToQuiz(response) {
            try {
                console.log('تلاش برای تحلیل پاسخ هوش مصنوعی:', response);
                
                // پیدا کردن JSON در پاسخ
                let jsonStr = '';
                
                // روش ۱: یافتن بین اولین { و آخرین }
                const jsonStartIndex = response.indexOf('{');
                const jsonEndIndex = response.lastIndexOf('}') + 1;
                
                if (jsonStartIndex !== -1 && jsonEndIndex > 0) {
                    jsonStr = response.substring(jsonStartIndex, jsonEndIndex);
                    console.log('JSON یافت شده (روش ۱):', jsonStr);
                } else {
                    // روش ۲: استفاده از regex برای پیدا کردن بلوک JSON
                    const jsonRegex = /{[\s\S]*}/g;
                    const matches = response.match(jsonRegex);
                    
                    if (matches && matches.length > 0) {
                        jsonStr = matches[0];
                        console.log('JSON یافت شده (روش ۲):', jsonStr);
                    } else {
                        throw new Error('ساختار JSON در پاسخ یافت نشد');
                    }
                }
                
                // تلاش برای تبدیل JSON
                let quiz;
                try {
                    quiz = JSON.parse(jsonStr);
                } catch (parseError) {
                    console.error('خطا در parse کردن JSON:', parseError);
                    console.log('تلاش برای اصلاح JSON...');
                    
                    // ممکن است نیاز به اصلاح JSON باشد (گاهی هوش مصنوعی JSON نامعتبر می‌دهد)
                    jsonStr = jsonStr.replace(/\\"/g, '"')
                                     .replace(/\n/g, '\\n')
                                     .replace(/\r/g, '\\r')
                                     .replace(/\t/g, '\\t')
                                     .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
                    
                    try {
                        quiz = JSON.parse(jsonStr);
                    } catch (retryError) {
                        console.error('خطا در تلاش دوم برای parse کردن JSON:', retryError);
                        throw new Error('JSON نامعتبر از هوش مصنوعی دریافت شد');
                    }
                }
                
                console.log('ساختار JSON پردازش شده:', quiz);
                
                // اطمینان از صحت ساختار
                if (!quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
                    console.error('ساختار سوالات ناقص است:', quiz);
                    throw new Error('ساختار سوالات در پاسخ صحیح نیست');
                }
                
                // اصلاح احتمالی ID سوالات
                quiz.questions.forEach((question, index) => {
                    if (!question.id) {
                        question.id = index + 1;
                    }
                    
                    // اگر type نیست به صورت پیش‌فرض چندگزینه‌ای
                    if (!question.type) {
                        if (question.options && Array.isArray(question.options) && question.options.length > 0) {
                            question.type = "multichoice";
                        } else {
                            question.type = "truefalse";
                        }
                    }
                });
                
                return quiz;
            } catch (error) {
                console.error('خطا در تحلیل پاسخ هوش مصنوعی:', error, response);
                showNotification('خطا در تحلیل پاسخ هوش مصنوعی: ' + error.message, 'error');
                // یک آزمون نمونه برای جلوگیری از خطا
                return {
                    title: "آزمون اضطراری",
                    questions: [
                        {
                            id: 1,
                            type: "multichoice",
                            text: "متاسفانه در ایجاد آزمون مشکلی پیش آمد. کدام گزینه صحیح است؟",
                            options: ["تلاش مجدد", "بررسی اتصال اینترنت", "بارگذاری مجدد فایل", "تغییر مدل هوش مصنوعی"],
                            answer: "تلاش مجدد",
                            explanation: "لطفا پارامترهای آزمون را تغییر داده و دوباره تلاش کنید."
                        }
                    ]
                };
            }
        }
        
        // نمایش سوالات آزمون به کاربر
        function renderQuizQuestions(quiz) {
            try {
                console.log('رندر کردن سوالات آزمون:', quiz);
                
                // بررسی وجود کانتینر سوالات
                const questionsContainer = document.getElementById('quizQuestions');
                if (!questionsContainer) {
                    console.error('کانتینر سوالات آزمون یافت نشد');
                    showNotification('خطا در نمایش آزمون: کانتینر سوالات یافت نشد', 'error');
                    return;
                }
                
                // بررسی معتبر بودن آزمون
                if (!quiz || !quiz.questions) {
                    console.error('آزمون معتبری برای نمایش دریافت نشد');
                    
                    // بررسی نوع داده آزمون
                    if (quiz && typeof quiz === 'object') {
                        console.log('آزمون یک شیء است اما questions ندارد، بررسی کلیدهای موجود:', Object.keys(quiz));
                        
                        // اگر quiz خود سوالات را دارد (فرمت قدیمی)
                        if (Array.isArray(quiz) || (quiz.quiz && quiz.quiz.questions)) {
                            const questions = Array.isArray(quiz) ? quiz : quiz.quiz.questions;
                            console.log('سوالات از فرمت قدیمی یافت شد:', questions);
                            
                            // ایجاد ساختار آزمون جدید
                            quiz = {
                                title: quiz.title || 'آزمون بازیابی شده',
                                questions: questions
                            };
                            
                            // ذخیره در متغیر سراسری
                            window.currentQuiz = quiz;
                        }
                    }
                    
                    // اگر همچنان آزمون معتبر نیست
                    if (!quiz || !quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
                        questionsContainer.innerHTML = '<div class="quiz-error">آزمون معتبری برای نمایش وجود ندارد</div>';
                        showNotification('آزمون معتبری برای نمایش وجود ندارد', 'error');
                        return;
                    }
                }
                
                // اطمینان از وجود آرایه سوالات
                if (!Array.isArray(quiz.questions)) {
                    console.error('سوالات آزمون یک آرایه نیست:', quiz.questions);
                    
                    // تلاش برای تبدیل به آرایه اگر شیء است
                    if (typeof quiz.questions === 'object') {
                        const questions = Object.values(quiz.questions);
                        if (questions.length > 0) {
                            console.log('تبدیل سوالات از شیء به آرایه:', questions);
                            quiz.questions = questions;
                        } else {
                            questionsContainer.innerHTML = '<div class="quiz-error">ساختار سوالات آزمون نامعتبر است</div>';
                            showNotification('ساختار سوالات آزمون نامعتبر است', 'error');
                            return;
                        }
                    } else {
                        questionsContainer.innerHTML = '<div class="quiz-error">ساختار سوالات آزمون نامعتبر است</div>';
                        showNotification('ساختار سوالات آزمون نامعتبر است', 'error');
                        return;
                    }
                }
                
                // پاک کردن محتوای قبلی
                questionsContainer.innerHTML = '';
                
                console.log(`نمایش ${quiz.questions.length} سوال`);
                
                // ایجاد المان‌های سوال
                quiz.questions.forEach((question, index) => {
                    try {
                        if (!question || !question.text) {
                            console.warn(`سوال ${index + 1} ناقص است:`, question);
                            return;
                        }
                        
                        const questionElement = document.createElement('div');
                        questionElement.className = 'quiz-question';
                        questionElement.innerHTML = `
                            <div class="question-text">${index + 1}. ${question.text}</div>
                            <div class="question-options" id="options-${index}"></div>
                        `;
                        
                        questionsContainer.appendChild(questionElement);
                        
                        const optionsContainer = document.getElementById(`options-${index}`);
                        if (!optionsContainer) {
                            console.error(`کانتینر گزینه‌های سوال ${index + 1} یافت نشد`);
                            return;
                        }
                        
                        // بررسی نوع سوال و ایجاد گزینه‌ها
                        const questionType = question.type ? question.type.toLowerCase() : null;
                        
                        if (questionType === 'multichoice' && Array.isArray(question.options) && question.options.length > 0) {
                            // سوال چندگزینه‌ای
                            question.options.forEach((option, optIndex) => {
                                const optionElement = createOptionElement(index, option, false);
                                optionsContainer.appendChild(optionElement);
                            });
                        } else if (questionType === 'truefalse' || (questionType === null && !question.options)) {
                            // سوال درست/غلط یا سوال بدون نوع مشخص
                            const optionTrue = createOptionElement(index, 'صحیح', false, 'true');
                            const optionFalse = createOptionElement(index, 'غلط', false, 'false');
                            
                            optionsContainer.appendChild(optionTrue);
                            optionsContainer.appendChild(optionFalse);
                        } else if (Array.isArray(question.options) && question.options.length > 0) {
                            // سوال با گزینه‌های موجود اما بدون نوع مشخص
                            question.options.forEach((option, optIndex) => {
                                const optionElement = createOptionElement(index, option, false);
                                optionsContainer.appendChild(optionElement);
                            });
                        } else {
                            // نوع سوال نامشخص یا پشتیبانی نشده
                            optionsContainer.innerHTML = '<div class="option-error">گزینه‌های سوال یافت نشد</div>';
                            console.warn(`گزینه‌های سوال ${index + 1} یافت نشد:`, question);
                        }
                    } catch (questionError) {
                        console.error(`خطا در رندر سوال ${index + 1}:`, questionError);
                    }
                });
                
                // ذخیره آزمون در localStorage
                if (typeof saveQuizState === 'function') {
                    saveQuizState();
                }
                
                // افزودن کلاس به کانتینر اصلی برای نمایش بخش آزمون
                const quizContainer = document.getElementById('quizContainer');
                if (quizContainer) {
                    quizContainer.classList.add('active');
                }
                
                // فعال کردن تب آزمون‌دهی در صورت نیاز
                if (typeof activateQuizTab === 'function') {
                    activateQuizTab('taker');
                }
                
                console.log('سوالات آزمون با موفقیت رندر شد');
            } catch (error) {
                console.error('خطا در رندر سوالات آزمون:', error);
                showNotification('خطا در نمایش سوالات آزمون: ' + error.message, 'error');
                
                // نمایش خطا در کانتینر سوالات
                const questionsContainer = document.getElementById('quizQuestions');
                if (questionsContainer) {
                    questionsContainer.innerHTML = `<div class="quiz-error">خطا در نمایش سوالات آزمون: ${error.message}</div>`;
                }
            }
        }
        
        // ایجاد المان گزینه
        function createOptionElement(questionId, optionText, isSelected, value) {
            try {
                const optionElement = document.createElement('div');
                optionElement.className = 'option-item';
                
                const optionValue = value || optionText;
                const optionId = `q${questionId}-opt-${typeof optionValue === 'string' ? optionValue.replace(/\s+/g, '_') : Math.random().toString(36).substring(2, 8)}`;
                
                optionElement.innerHTML = `
                    <input type="radio" id="${optionId}" name="q${questionId}" value="${optionValue}" ${isSelected ? 'checked' : ''}>
                    <label for="${optionId}" class="option-text">${optionText}</label>
                `;
                
                // افزودن رویداد تغییر برای ذخیره پاسخ‌ها
                const radioInput = optionElement.querySelector('input[type="radio"]');
                if (radioInput) {
                    radioInput.addEventListener('change', function() {
                        if (this.checked) {
                            // ذخیره پاسخ کاربر
                            if (typeof window.userAnswers !== 'object') {
                                window.userAnswers = {};
                            }
                            
                            window.userAnswers[questionId] = this.value;
                            console.log(`پاسخ سوال ${questionId + 1} ذخیره شد:`, this.value);
                            
                            // ذخیره در localStorage
                            if (typeof saveQuizState === 'function') {
                                saveQuizState();
                            }
                        }
                    });
                }
                
                return optionElement;
            } catch (error) {
                console.error('خطا در ایجاد المان گزینه:', error);
                const errorElement = document.createElement('div');
                errorElement.className = 'option-error';
                errorElement.textContent = 'خطا در نمایش گزینه';
                return errorElement;
            }
        }
        
        // ارزیابی پاسخ‌های کاربر
        function evaluateQuizAnswers(quiz, userAnswers) {
            const result = {
                totalQuestions: quiz.questions.length,
                correctCount: 0,
                questions: []
            };
            
            quiz.questions.forEach(question => {
                const userAnswer = userAnswers[question.id];
                const correctAnswer = question.answer;
                
                // تبدیل صحیح/غلط به معادل فارسی
                const normalizedUserAnswer = userAnswer === 'صحیح' ? 'true' : (userAnswer === 'غلط' ? 'false' : userAnswer);
                const normalizedCorrectAnswer = correctAnswer === 'صحیح' ? 'true' : (correctAnswer === 'غلط' ? 'false' : correctAnswer);
                
                const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
                
                if (isCorrect) {
                    result.correctCount++;
                }
                
                result.questions.push({
                    id: question.id,
                    text: question.text,
                    userAnswer,
                    correctAnswer,
                    isCorrect,
                    explanation: question.explanation,
                    type: question.type
                });
            });
            
            return result;
        }
        
        // نمایش نتایج آزمون
        function renderQuizResults(result) {
            console.log('نمایش نتایج آزمون:', result);
            
            if (!quizScoreDisplay || !quizResultDetails) {
                console.error('المان‌های نمایش نتایج یافت نشد');
                return;
            }
            
            // نمایش نمره
            if (quizScoreDisplay) {
                quizScoreDisplay.textContent = `${result.correctCount}/${result.totalQuestions}`;
            }
            
            // پاک کردن نتایج قبلی
            if (quizResultDetails) {
                quizResultDetails.innerHTML = '';
            
                // نمایش هر سوال و نتیجه آن
                result.questions.forEach((question, index) => {
                    try {
                        const resultItem = document.createElement('div');
                        resultItem.className = 'result-item';
                        
                        // متن سوال
                        const questionText = document.createElement('div');
                        questionText.className = 'result-question';
                        questionText.textContent = `${index + 1}. ${question.text}`;
                        
                        // پاسخ کاربر
                        const userAnswerElement = document.createElement('div');
                        userAnswerElement.className = `user-answer ${question.isCorrect ? 'correct' : 'incorrect'}`;
                        userAnswerElement.innerHTML = `
                            <strong>پاسخ شما: </strong>
                            <span>${question.userAnswer || 'بدون پاسخ'}</span>
                            ${question.isCorrect ? ' ✓' : ' ✗'}
                        `;
                        
                        // پاسخ صحیح (اگر کاربر اشتباه پاسخ داده باشد)
                        let correctAnswerElement = null;
                        if (!question.isCorrect) {
                            correctAnswerElement = document.createElement('div');
                            correctAnswerElement.className = 'correct-answer';
                            correctAnswerElement.innerHTML = `
                                <strong>پاسخ صحیح: </strong>
                                <span>${question.correctAnswer || 'نامشخص'}</span>
                            `;
                        }
                        
                        // توضیح
                        const explanationElement = document.createElement('div');
                        explanationElement.className = 'result-explanation';
                        explanationElement.textContent = question.explanation || 'توضیحی ارائه نشده است.';
                        
                        // افزودن المان‌ها به آیتم نتیجه
                        resultItem.appendChild(questionText);
                        
                        const answerContainer = document.createElement('div');
                        answerContainer.className = 'result-answer';
                        answerContainer.appendChild(userAnswerElement);
                        if (correctAnswerElement) {
                            answerContainer.appendChild(correctAnswerElement);
                        }
                        
                        resultItem.appendChild(answerContainer);
                        resultItem.appendChild(explanationElement);
                        
                        // افزودن آیتم به لیست نتایج
                        quizResultDetails.appendChild(resultItem);
                    } catch (err) {
                        console.error('خطا در نمایش نتیجه سوال:', err, question);
                    }
                });
            }
            
            console.log('نمایش نتایج کامل شد');
        }
        
        // اضافه کردن دکمه پاک کردن آزمون در فاز طراحی
        const createClearQuizButton = () => {
            // بررسی وجود دکمه قبلی
            let clearQuizButton = document.getElementById('clearQuizButton');
            if (!clearQuizButton && quizBuilderPanel) {
                clearQuizButton = document.createElement('button');
                clearQuizButton.id = 'clearQuizButton';
                clearQuizButton.className = 'quiz-clear-button';
                clearQuizButton.textContent = 'پاک کردن آزمون';
                clearQuizButton.style.marginTop = '10px';
                
                // افزودن رویداد کلیک
                clearQuizButton.addEventListener('click', () => {
                    if (confirm('آیا از پاک کردن کامل آزمون اطمینان دارید؟')) {
                        clearQuizState();
                        quizPromptInput.value = '';
                        showNotification('آزمون پاک شد.', 'info');
                    }
                });
                
                // افزودن به پنل طراحی آزمون
                const promptContainer = quizBuilderPanel.querySelector('.quiz-prompt-container');
                if (promptContainer) {
                    promptContainer.appendChild(clearQuizButton);
                }
            }
        };
        
        // فراخوانی تابع ایجاد دکمه پاک کردن
        createClearQuizButton();
        
        // برگرداندن دسترسی به متغیرهای مورد نیاز برای کد بیرونی
        return {
            currentQuiz,
            userAnswers,
            activateTab,
            renderQuizQuestions,
            saveQuizState,
            clearQuizState
        };
    })();
    
    // مدیریت تاریخچه آزمون‌ها
    const quizHistoryKey = 'quizHistory';
    const saveQuizDialog = document.getElementById('saveQuizDialog');
    const quizTitleInput = document.getElementById('quizTitleInput');
    const confirmSaveQuizBtn = document.getElementById('confirmSaveQuiz');
    const cancelSaveQuizBtn = document.getElementById('cancelSaveQuiz');
    const saveQuizToHistoryBtn = document.getElementById('saveQuizToHistory');
    const quizHistoryList = document.getElementById('quizHistoryList');
    const showQuizHistoryBtn = document.getElementById('showQuizHistory');
    
    // بارگذاری تاریخچه آزمون‌ها
    function loadQuizHistory() {
        try {
            const historyJson = localStorage.getItem(quizHistoryKey);
            return historyJson ? JSON.parse(historyJson) : [];
        } catch (error) {
            console.error('خطا در بارگذاری تاریخچه آزمون:', error);
            return [];
        }
    }
    
    // ذخیره تاریخچه آزمون‌ها
    function saveQuizHistory(historyArray) {
        try {
            localStorage.setItem(quizHistoryKey, JSON.stringify(historyArray));
            console.log('تاریخچه آزمون ذخیره شد');
        } catch (error) {
            console.error('خطا در ذخیره تاریخچه آزمون:', error);
            showNotification('خطا در ذخیره تاریخچه آزمون', 'error');
        }
    }
    
    // افزودن آزمون به تاریخچه
    function addQuizToHistory(quiz, title) {
        try {
            console.log('تلاش برای افزودن آزمون به تاریخچه با عنوان:', title);
            console.log('آزمون دریافتی:', quiz);
            
            // بررسی معتبر بودن آزمون
            if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                console.error('آزمون معتبری برای ذخیره دریافت نشد');
                
                // تلاش برای یافتن آزمون از منابع دیگر
                if (typeof quizModule !== 'undefined' && quizModule && quizModule.currentQuiz) {
                    console.log('استفاده از آزمون از quizModule.currentQuiz');
                    quiz = quizModule.currentQuiz;
                } else if (typeof window.currentQuiz !== 'undefined' && window.currentQuiz) {
                    console.log('استفاده از آزمون از window.currentQuiz');
                    quiz = window.currentQuiz;
                } else if (typeof currentQuiz !== 'undefined' && currentQuiz) {
                    console.log('استفاده از آزمون از متغیر محلی currentQuiz');
                    quiz = currentQuiz;
                } else {
                    // تلاش برای بازیابی از localStorage
                    try {
                        const savedQuizState = localStorage.getItem('quizState');
                        if (savedQuizState) {
                            const parsedState = JSON.parse(savedQuizState);
                            if (parsedState && parsedState.quiz) {
                                console.log('استفاده از آزمون از localStorage');
                                quiz = parsedState.quiz;
                            }
                        }
                    } catch (storageError) {
                        console.error('خطا در بازیابی از localStorage:', storageError);
                    }
                }
                
                // اگر همچنان آزمون معتبری نیست
                if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                    showNotification('آزمون معتبری برای ذخیره وجود ندارد', 'error');
                    return false;
                }
            }
            
            // اطمینان از وجود عنوان
            if (!title || title.trim() === '') {
                title = quiz.title || `آزمون جدید - ${new Date().toLocaleDateString('fa-IR')}`;
            }
            
            // دریافت تاریخچه فعلی
            const history = loadQuizHistory();
            
            // ایجاد یک شناسه منحصربفرد
            const quizId = Date.now().toString();
            
            // ایجاد نسخه‌ای از آزمون برای ذخیره (با خصوصیات اضافی)
            const quizToSave = {
                ...quiz,
                id: quizId,
                title: title,
                timestamp: new Date().toISOString(),
                questionsCount: quiz.questions.length
            };
            
            // افزودن به تاریخچه
            history.unshift(quizToSave);
            
            // ذخیره تاریخچه جدید
            saveQuizHistory(history);
            
            console.log('آزمون با موفقیت به تاریخچه اضافه شد');
            showNotification(`آزمون "${title}" با موفقیت ذخیره شد`, 'success');
            
            // بروزرسانی نمایش تاریخچه
            renderQuizHistory();
            
            return true;
        } catch (error) {
            console.error('خطا در افزودن آزمون به تاریخچه:', error);
            showNotification('خطا در ذخیره آزمون: ' + error.message, 'error');
            return false;
        }
    }
    
    // حذف آزمون از تاریخچه
    function removeQuizFromHistory(quizId) {
        try {
            const history = loadQuizHistory();
            const updatedHistory = history.filter(item => item.id !== quizId);
            
            saveQuizHistory(updatedHistory);
            renderQuizHistory();
            
            showNotification('آزمون با موفقیت حذف شد', 'info');
            return true;
        } catch (error) {
            console.error('خطا در حذف آزمون از تاریخچه:', error);
            showNotification('خطا در حذف آزمون', 'error');
            return false;
        }
    }
    
    // بارگذاری آزمون از تاریخچه
    function loadQuizFromHistory(quizId) {
        try {
            console.log('تلاش برای بارگذاری آزمون از تاریخچه با شناسه:', quizId);
            
            // بررسی پارامتر ورودی
            if (!quizId) {
                console.error('شناسه آزمون برای بارگذاری ارائه نشده است');
                showNotification('خطا: شناسه آزمون نامعتبر است', 'error');
                return;
            }
            
            // بارگذاری تاریخچه
            const history = loadQuizHistory();
            console.log('تاریخچه بارگذاری شده:', history);
            
            if (!Array.isArray(history) || history.length === 0) {
                console.error('تاریخچه آزمون خالی است یا به درستی بارگذاری نشده است');
                showNotification('تاریخچه آزمون یافت نشد', 'error');
                return;
            }
            
            // یافتن آزمون با شناسه داده شده
            let historyItem = null;
            
            // در صورتی که شناسه به صورت عددی یا رشته باشد
            if (typeof quizId === 'string' && quizId.match(/^\d+$/)) {
                quizId = parseInt(quizId, 10);
            }
            
            // جستجو با انواع مختلف
            console.log('جستجوی آزمون با شناسه:', quizId, 'نوع:', typeof quizId);
            
            historyItem = history.find(item => {
                // مقایسه دقیق
                if (item.id === quizId) return true;
                
                // مقایسه رشته‌ای
                if (item.id && quizId && item.id.toString() === quizId.toString()) return true;
                
                // مقایسه در فرمت‌های مختلف
                if (item.id === parseInt(quizId)) return true;
                if (parseInt(item.id) === quizId) return true;
                
                return false;
            });
            
            if (!historyItem) {
                console.error('آزمونی با شناسه مورد نظر یافت نشد:', quizId);
                
                // نمایش شناسه‌های موجود برای عیب‌یابی
                console.log('شناسه‌های موجود در تاریخچه:');
                history.forEach((item, index) => {
                    console.log(`آیتم ${index}:`, item.id, typeof item.id);
                });
                
                showNotification('آزمون مورد نظر در تاریخچه یافت نشد', 'error');
                return;
            }
            
            console.log('آزمون یافت شده از تاریخچه:', historyItem);
            
            // استخراج آزمون از آیتم تاریخچه
            let quizToLoad = null;
            
            // بررسی فرمت‌های مختلف ذخیره‌سازی
            if (historyItem.quiz && historyItem.quiz.questions) {
                console.log('استفاده از فرمت جدید (quiz در historyItem)');
                quizToLoad = historyItem.quiz;
            } else if (historyItem.questions) {
                console.log('استفاده از فرمت مستقیم (questions در historyItem)');
                quizToLoad = historyItem;
            } else {
                console.warn('ساختار آزمون ناشناخته است، تلاش برای یافتن سوالات...');
                
                // بررسی کلیدهای موجود
                const keys = Object.keys(historyItem);
                console.log('کلیدهای موجود در آیتم تاریخچه:', keys);
                
                // تلاش برای یافتن کلید حاوی سوالات
                for (const key of keys) {
                    const value = historyItem[key];
                    if (value && typeof value === 'object') {
                        if (Array.isArray(value) && value.length > 0 && value[0].text) {
                            console.log(`سوالات در کلید "${key}" یافت شد`);
                            quizToLoad = {
                                title: historyItem.title || 'آزمون بازیابی شده',
                                questions: value
                            };
                            break;
                        } else if (value.questions && Array.isArray(value.questions)) {
                            console.log(`سوالات در کلید "${key}.questions" یافت شد`);
                            quizToLoad = value;
                            break;
                        }
                    }
                }
                
                // اگر هنوز آزمونی یافت نشده، یک ساختار جدید ایجاد می‌کنیم
                if (!quizToLoad) {
                    console.warn('ساختار سوالات یافت نشد، ایجاد ساختار جدید...');
                    quizToLoad = {
                        title: historyItem.title || 'آزمون بازیابی شده',
                        id: historyItem.id,
                        questions: []
                    };
                    
                    // اگر کل historyItem یک آرایه باشد، آن را به عنوان سوالات در نظر می‌گیریم
                    if (Array.isArray(historyItem)) {
                        quizToLoad.questions = historyItem;
                    }
                }
            }
            
            // بررسی نهایی ساختار آزمون
            if (!quizToLoad || !quizToLoad.questions) {
                console.error('آزمون بارگذاری شده معتبر نیست:', quizToLoad);
                showNotification('ساختار آزمون بارگذاری شده معتبر نیست', 'error');
                return;
            }
            
            // افزودن عنوان اگر موجود نیست
            if (!quizToLoad.title && historyItem.title) {
                quizToLoad.title = historyItem.title;
            }
            
            console.log('آزمون آماده برای بارگذاری:', quizToLoad);
            
            // تنظیم آزمون جاری
            window.currentQuiz = quizToLoad;
            window.userAnswers = {};
            
            // اطمینان از دسترسی ماژول آزمون به آزمون جاری
            if (typeof quizModule !== 'undefined' && quizModule) {
                quizModule.currentQuiz = quizToLoad;
            }
            
            // نمایش آزمون
            if (typeof renderQuizQuestions === 'function') {
                renderQuizQuestions(quizToLoad);
                showNotification(`آزمون "${quizToLoad.title || 'بارگذاری شده'}" با موفقیت بارگذاری شد`, 'success');
                
                // فعال کردن تب آزمون
                if (typeof activateQuizTab === 'function') {
                    activateQuizTab('taker');
                }
            } else {
                console.error('تابع renderQuizQuestions در دسترس نیست');
                showNotification('خطا در نمایش آزمون: تابع لازم در دسترس نیست', 'error');
            }
        } catch (error) {
            console.error('خطا در بارگذاری آزمون از تاریخچه:', error);
            showNotification('خطا در بارگذاری آزمون: ' + error.message, 'error');
        }
    }
    
    // نمایش تاریخچه آزمون‌ها
    function renderQuizHistory() {
        try {
            console.log('رندر کردن تاریخچه آزمون‌ها');
            const historyContainer = document.getElementById('quizHistoryList');
            if (!historyContainer) {
                console.error('کانتینر تاریخچه آزمون یافت نشد');
                return;
            }
            
            // پاک کردن محتوای فعلی
            historyContainer.innerHTML = '';
            
            // دریافت تاریخچه
            const history = loadQuizHistory();
            console.log('تاریخچه بارگذاری شده:', history);
            
            // نمایش پیام خالی بودن اگر تاریخچه خالی باشد
            if (!history || history.length === 0) {
                historyContainer.innerHTML = '<div class="quiz-history-empty">تاکنون هیچ آزمونی ذخیره نشده است.</div>';
                return;
            }
            
            // ایجاد لیست آزمون‌ها
            history.forEach(item => {
                try {
                    console.log('رندر کردن آیتم تاریخچه:', item);
                    
                    // بررسی معتبر بودن آیتم
                    if (!item || (!item.id && !item.quiz && !item.title)) {
                        console.warn('آیتم تاریخچه نامعتبر است:', item);
                        return; // رد کردن آیتم نامعتبر
                    }
                    
                    const quiz = item.quiz || item; // پشتیبانی از هر دو فرمت ذخیره (جدید و قدیمی)
                    const quizId = item.id || quiz.id;
                    const title = item.title || quiz.title || 'آزمون بدون عنوان';
                    const date = new Date(item.timestamp || item.date || Date.now());
                    const questionsCount = item.questionCount || item.questionsCount || (quiz.questions ? quiz.questions.length : 0);
                    
                    // تبدیل تاریخ به فرمت فارسی
                    const persianDate = new Intl.DateTimeFormat('fa-IR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }).format(date);
                    
                    const historyItem = document.createElement('div');
                    historyItem.className = 'quiz-history-item';
                    historyItem.innerHTML = `
                        <div class="quiz-history-item-title">${title}</div>
                        <div class="quiz-history-item-meta">
                            <div>تاریخ: ${persianDate}</div>
                            <div>تعداد سوالات: ${questionsCount}</div>
                        </div>
                        <div class="quiz-history-item-actions">
                            <button class="quiz-history-action-button quiz-history-load-button" data-quiz-id="${quizId}">بارگیری آزمون</button>
                            <button class="quiz-history-action-button quiz-history-delete-button" data-quiz-id="${quizId}">حذف</button>
                        </div>
                    `;
                    
                    // افزودن به کانتینر
                    historyContainer.appendChild(historyItem);
                    
                    // اضافه کردن رویداد دکمه‌ها
                    const loadButton = historyItem.querySelector('.quiz-history-load-button');
                    const deleteButton = historyItem.querySelector('.quiz-history-delete-button');
                    
                    if (loadButton) {
                        loadButton.addEventListener('click', function() {
                            loadQuizFromHistory(quizId);
                        });
                    }
                    
                    if (deleteButton) {
                        deleteButton.addEventListener('click', function() {
                            if (confirm(`آیا از حذف آزمون "${title}" اطمینان دارید؟`)) {
                                removeQuizFromHistory(quizId);
                            }
                        });
                    }
                } catch (itemError) {
                    console.error('خطا در رندر آیتم تاریخچه:', itemError);
                }
            });
        } catch (error) {
            console.error('خطا در رندر تاریخچه آزمون‌ها:', error);
            showNotification('خطا در نمایش تاریخچه آزمون‌ها: ' + error.message, 'error');
        }
    }
    
    // نمایش دیالوگ ذخیره آزمون - با خطایابی دقیق‌تر
    function showSaveQuizDialog() {
        try {
            console.log('تلاش برای نمایش دیالوگ ذخیره آزمون');
            
            // بررسی همه منابع ممکن برای آزمون فعلی
            let quiz = null;
            
            // بررسی در ماژول آزمون
            if (typeof quizModule !== 'undefined' && quizModule) {
                console.log('quizModule وجود دارد');
                if (quizModule.currentQuiz) {
                    console.log('quizModule.currentQuiz یافت شد:', quizModule.currentQuiz);
                    quiz = quizModule.currentQuiz;
                }
            }
            
            // بررسی در متغیر سراسری
            if (!quiz && typeof window.currentQuiz !== 'undefined' && window.currentQuiz) {
                console.log('window.currentQuiz یافت شد:', window.currentQuiz);
                quiz = window.currentQuiz;
            }
            
            // بررسی در متغیر محلی
            if (!quiz && typeof currentQuiz !== 'undefined' && currentQuiz) {
                console.log('متغیر محلی currentQuiz یافت شد:', currentQuiz);
                quiz = currentQuiz;
            }
            
            // بررسی وضعیت آزمون یافت شده
            console.log('وضعیت نهایی آزمون برای ذخیره:', quiz);
            
            if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                console.error('آزمون معتبری برای ذخیره وجود ندارد');
                console.log('محتوای quiz:', quiz);
                console.log('آیا userAnswers موجود است؟', typeof userAnswers !== 'undefined' ? userAnswers : 'تعریف نشده');
                
                // آخرین تلاش: بازیابی از localStorage
                try {
                    const savedQuizState = localStorage.getItem('quizState');
                    if (savedQuizState) {
                        const parsedState = JSON.parse(savedQuizState);
                        if (parsedState && parsedState.quiz && parsedState.quiz.questions && parsedState.quiz.questions.length > 0) {
                            console.log('آزمون از localStorage بازیابی شد');
                            quiz = parsedState.quiz;
                        }
                    }
                } catch (storageError) {
                    console.error('خطا در بازیابی از localStorage:', storageError);
                }
                
                // اگر همچنان آزمونی یافت نشد
                if (!quiz || !quiz.questions || quiz.questions.length === 0) {
                    showNotification('آزمون معتبری برای ذخیره وجود ندارد. لطفاً ابتدا یک آزمون ایجاد کنید.', 'error');
                    return;
                }
            }
            
            // ذخیره آزمون یافت شده در متغیر سراسری
            window.currentQuiz = quiz;
            
            // نمایش دیالوگ
            const dialog = document.getElementById('saveQuizDialog');
            if (!dialog) {
                console.error('دیالوگ ذخیره آزمون در DOM یافت نشد!');
                showNotification('خطا در نمایش دیالوگ ذخیره - دیالوگ در DOM یافت نشد', 'error');
                
                // اگر دیالوگ وجود ندارد، روش اضطراری را فراخوانی می‌کنیم
                if (typeof showEmergencySaveDialog === 'function') {
                    console.log('استفاده از روش اضطراری برای نمایش دیالوگ');
                    showEmergencySaveDialog();
                }
                return;
            }
            
            // تنظیم عنوان آزمون
            const titleInput = document.getElementById('quizTitleInput');
            if (titleInput) {
                titleInput.value = quiz.title || `آزمون جدید - ${new Date().toLocaleDateString('fa-IR')}`;
            } else {
                console.warn('فیلد ورودی عنوان آزمون یافت نشد');
            }
            
            // نمایش دیالوگ
            dialog.style.display = 'flex';
            dialog.classList.add('active');
        } catch (error) {
            console.error('خطا در نمایش دیالوگ ذخیره آزمون:', error);
            showNotification('خطا در نمایش دیالوگ ذخیره آزمون: ' + error.message, 'error');
            
            // در صورت خطا، روش اضطراری را امتحان می‌کنیم
            if (typeof showEmergencySaveDialog === 'function') {
                setTimeout(() => showEmergencySaveDialog(), 100);
            }
        }
    }
    
    // مخفی کردن دیالوگ ذخیره آزمون - بازنویسی کامل
    function hideSaveQuizDialog() {
        try {
            console.log('تلاش برای مخفی کردن دیالوگ ذخیره آزمون');
            
            const dialog = document.getElementById('saveQuizDialog');
            if (!dialog) {
                console.error('دیالوگ ذخیره آزمون برای مخفی کردن یافت نشد');
                return;
            }
            
            // مخفی کردن دیالوگ
            dialog.classList.remove('active');
            
            // برای اطمینان، با تایمر اضافی چک کنیم
            setTimeout(() => {
                if (dialog.classList.contains('active')) {
                    console.warn('دیالوگ هنوز فعال است، تلاش مجدد برای مخفی کردن');
                    dialog.classList.remove('active');
                    dialog.style.cssText = '';
                }
                
                // پاک کردن مقدار فیلد ورودی
                const titleInput = document.getElementById('quizTitleInput');
                if (titleInput) {
                    titleInput.value = '';
                }
                
            }, 200);
            
        } catch (error) {
            console.error('خطای نامشخص در مخفی کردن دیالوگ ذخیره آزمون:', error);
        }
    }
    
    // اتصال جدید و مستقیم دکمه ذخیره آزمون به رویداد کلیک
    function setupSaveButtonEvent() {
        console.log("تنظیم رویداد دکمه ذخیره آزمون");
        
        try {
            // دکمه ذخیره آزمون
            const saveButton = document.getElementById('saveQuizButton');
            if (saveButton) {
                saveButton.addEventListener('click', function() {
                    try {
                        // ذخیره محلی آزمون بدون استفاده از دیالوگ و تاریخچه
                        const currentQuiz = window.currentQuiz || {};
                        
                        if (!currentQuiz || !currentQuiz.questions || currentQuiz.questions.length === 0) {
                            showNotification("آزمونی برای ذخیره وجود ندارد", "error");
                            return;
                        }
                        
                        // ذخیره مستقیم در localStorage
                        const quizData = JSON.stringify(currentQuiz);
                        localStorage.setItem('lastSavedQuiz', quizData);
                        
                        // نمایش پیام موفقیت
                        showNotification("آزمون با موفقیت ذخیره شد", "success");
                        
                        console.log("آزمون با موفقیت ذخیره شد");
                    } catch (error) {
                        console.error("خطا در ذخیره آزمون:", error);
                        showNotification("خطا در ذخیره آزمون: " + error.message, "error");
                    }
                });
                console.log("رویداد دکمه ذخیره آزمون با موفقیت تنظیم شد");
            } else {
                console.error("دکمه ذخیره آزمون یافت نشد");
            }
        } catch (error) {
            console.error("خطا در تنظیم رویداد دکمه ذخیره آزمون:", error);
        }
    }

    // اضافه کردن دکمه بارگیری آخرین آزمون به جای استفاده از تاریخچه
    (function addLoadLastQuizButton() {
        try {
            // ایجاد دکمه بارگیری آخرین آزمون
            const builderPanel = document.getElementById('quizBuilderPanel');
            if (builderPanel) {
                const loadLastQuizButton = document.createElement('button');
                loadLastQuizButton.id = 'loadLastQuizButton';
                loadLastQuizButton.className = 'quiz-button primary-button';
                loadLastQuizButton.textContent = 'بارگیری آخرین آزمون';
                loadLastQuizButton.style.marginTop = '10px';
                
                // افزودن دکمه به پنل طراحی
                builderPanel.appendChild(loadLastQuizButton);
                
                // تنظیم رویداد بارگیری
                loadLastQuizButton.addEventListener('click', function() {
                    try {
                        // بارگیری آخرین آزمون ذخیره شده
                        const savedQuizData = localStorage.getItem('lastSavedQuiz');
                        
                        if (!savedQuizData) {
                            showNotification("آزمون ذخیره شده‌ای یافت نشد", "info");
                            return;
                        }
                        
                        const savedQuiz = JSON.parse(savedQuizData);
                        
                        // بارگیری آزمون
                        if (typeof window.renderQuizQuestions === 'function') {
                            window.currentQuiz = savedQuiz;
                            window.renderQuizQuestions(savedQuiz);
                            activateTab('taker');
                            showNotification("آزمون با موفقیت بارگیری شد", "success");
                        } else {
                            console.error("تابع renderQuizQuestions در دسترس نیست");
                            showNotification("خطا در بارگیری آزمون: تابع موردنیاز در دسترس نیست", "error");
                        }
                    } catch (error) {
                        console.error("خطا در بارگیری آخرین آزمون:", error);
                        showNotification("خطا در بارگیری آزمون: " + error.message, "error");
                    }
                });
                
                console.log("دکمه بارگیری آخرین آزمون با موفقیت اضافه شد");
            }
        } catch (error) {
            console.error("خطا در اضافه کردن دکمه بارگیری آخرین آزمون:", error);
        }
    })();
    
    // اتصال جدید و مستقیم دکمه‌های دیالوگ به رویدادهای کلیک
    function setupDialogButtonsEvents() {
        const confirmBtn = document.getElementById('confirmSaveQuiz');
        const cancelBtn = document.getElementById('cancelSaveQuiz');
        const titleInput = document.getElementById('quizTitleInput');
        
        if (confirmBtn) {
            // حذف تمام رویدادهای قبلی
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            // افزودن رویداد کلیک جدید
            newConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (!titleInput || !titleInput.value.trim()) {
                    showNotification('لطفاً عنوانی برای آزمون وارد کنید', 'error');
                    return;
                }
                
                const title = titleInput.value.trim();
                const quiz = window.currentQuiz || currentQuiz;
                
                if (addQuizToHistory(quiz, title)) {
                    hideSaveQuizDialog();
                    activateQuizTab('history');
                }
            });
        }
        
        if (cancelBtn) {
            // حذف تمام رویدادهای قبلی
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            
            // افزودن رویداد کلیک جدید
            newCancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                hideSaveQuizDialog();
            });
        }
    }
    
    // اتصال رویداد کلیک به اطراف دیالوگ برای بستن آن
    function setupDialogBackdropEvent() {
        const dialog = document.getElementById('saveQuizDialog');
        if (dialog) {
            // حذف تمام رویدادهای قبلی
            const newDialog = dialog.cloneNode(true);
            dialog.parentNode.replaceChild(newDialog, dialog);
            
            // افزودن رویداد کلیک جدید
            newDialog.addEventListener('click', (e) => {
                if (e.target === newDialog) {
                    hideSaveQuizDialog();
                }
            });
            
            // بازتنظیم رویدادهای دکمه‌های دیالوگ
            setupDialogButtonsEvents();
        }
    }
    
    // رویدادهای مرتبط با تاریخچه آزمون‌ها
    if (showQuizHistoryBtn) {
        showQuizHistoryBtn.addEventListener('click', () => {
            console.log('دکمه تاریخچه آزمون کلیک شد');
            activateQuizTab('history');
        });
    }
    
    // اجرای تمام تنظیمات رویدادها
    setupSaveButtonEvent();
    setupDialogBackdropEvent();
    
    // افزودن رویداد کلید ESC برای بستن دیالوگ
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const dialog = document.getElementById('saveQuizDialog');
            if (dialog && dialog.classList.contains('active')) {
                hideSaveQuizDialog();
            }
        }
    });
    
    // بارگذاری اولیه تاریخچه آزمون‌ها
    renderQuizHistory();

    // متغیرهای مورد نیاز از ماژول آزمون
    let quizModule; // ذخیره مقدار بازگشتی از IIFE

    // اجرای ماژول آزمون
    function initQuizModule() {
        console.log("راه‌اندازی ماژول آزمون");
        
        // بارگذاری وضعیت آزمون
        loadQuizState();
        
        // تنظیم رویدادهای دکمه‌های تب
        document.getElementById('showQuizBuilder').addEventListener('click', function() {
            activateTab('builder');
        });
        
        document.getElementById('showQuizTaker').addEventListener('click', function() {
            activateTab('taker');
        });
        
        document.getElementById('showQuizResults').addEventListener('click', function() {
            activateTab('results');
        });
        
        // حذف رویداد دکمه تاریخچه و حذف فراخوانی توابع مربوط به دیالوگ
        
        // تنظیم رویداد دکمه ذخیره
        setupSaveButtonEvent();
        
        console.log("ماژول آزمون با موفقیت راه‌اندازی شد");
    }

    // اجرای راه‌اندازی ماژول
    initQuizModule();

    // اجرای راه‌اندازی دکمه اضطراری
    console.log('راه‌اندازی رویدادهای ذخیره آزمون');
    setupEmergencySaveButton();
    
    // بارگذاری اولیه تاریخچه آزمون‌ها
    renderQuizHistory();

    // فعال کردن رویدادهای تاریخچه آزمون
    function setupQuizHistoryEvents() {
        try {
            console.log('تنظیم رویدادهای تاریخچه آزمون');
            
            // بارگذاری اولیه تاریخچه آزمون‌ها
            renderQuizHistory();
            
            // فعال کردن رویدادهای دکمه‌های بارگذاری و حذف
            const historyList = document.getElementById('quizHistoryList');
            if (historyList) {
                historyList.addEventListener('click', function(event) {
                    // بررسی دکمه بارگذاری
                    if (event.target.classList.contains('quiz-history-load-button')) {
                        event.preventDefault();
                        const quizId = event.target.getAttribute('data-quiz-id');
                        console.log('درخواست بارگذاری آزمون با شناسه:', quizId);
                        
                        if (quizId) {
                            loadQuizFromHistory(quizId);
                        } else {
                            console.error('شناسه آزمون برای بارگذاری یافت نشد');
                            showNotification('خطا در بارگذاری آزمون: شناسه یافت نشد', 'error');
                        }
                    }
                    
                    // بررسی دکمه حذف
                    if (event.target.classList.contains('quiz-history-delete-button')) {
                        event.preventDefault();
                        const quizId = event.target.getAttribute('data-quiz-id');
                        const title = event.target.closest('.quiz-history-item').querySelector('.quiz-history-item-title').textContent;
                        
                        if (quizId && confirm(`آیا از حذف آزمون "${title}" اطمینان دارید؟`)) {
                            removeQuizFromHistory(quizId);
                        }
                    }
                });
            }
            
            // دکمه نمایش تاریخچه
            const historyTabButton = document.getElementById('showQuizHistory');
            if (historyTabButton) {
                historyTabButton.addEventListener('click', function(event) {
                    event.preventDefault();
                    console.log('نمایش تاریخچه آزمون‌ها');
                    
                    // بارگذاری مجدد تاریخچه
                    renderQuizHistory();
                    
                    // فعال کردن تب تاریخچه
                    if (typeof activateQuizTab === 'function') {
                        activateQuizTab('history');
                    }
                });
            }
            
            console.log('رویدادهای تاریخچه آزمون با موفقیت تنظیم شد');
        } catch (error) {
            console.error('خطا در تنظیم رویدادهای تاریخچه آزمون:', error);
        }
    }

    // اجرای فعال‌سازی رویدادهای تاریخچه
    setupQuizHistoryEvents();

    // اضافه کردن رویداد مستقیم به دکمه تاریخچه
    (function setupHistoryTabButton() {
        try {
            console.log('تنظیم رویداد دکمه تاریخچه به صورت مستقیم');
            
            const historyButton = document.getElementById('showQuizHistory');
            if (!historyButton) {
                console.error('دکمه تاریخچه (showQuizHistory) یافت نشد');
                return;
            }
            
            console.log('دکمه تاریخچه یافت شد:', historyButton);
            
            // حذف تمام رویدادهای قبلی با کلون کردن
            const newHistoryButton = historyButton.cloneNode(true);
            historyButton.parentNode.replaceChild(newHistoryButton, historyButton);
            
            // اضافه کردن رویداد کلیک
            newHistoryButton.addEventListener('click', function(event) {
                event.preventDefault();
                console.log('کلیک روی دکمه تاریخچه');
                
                try {
                    // فعال‌سازی تب تاریخچه
                    if (typeof activateQuizTab === 'function') {
                        activateQuizTab('history');
                    } else if (typeof activateTab === 'function') {
                        activateTab('history');
                    } else {
                        console.error('توابع activateQuizTab و activateTab در دسترس نیستند');
                        
                        // روش دستی فعال‌سازی تب
                        const allTabs = document.querySelectorAll('.quiz-tab');
                        const allPanels = document.querySelectorAll('.quiz-panel');
                        
                        // غیرفعال کردن همه تب‌ها و پنل‌ها
                        allTabs.forEach(tab => tab.classList.remove('active'));
                        allPanels.forEach(panel => panel.classList.remove('active'));
                        
                        // فعال کردن تب و پنل تاریخچه
                        const historyTab = document.getElementById('showQuizHistory');
                        const historyPanel = document.getElementById('quizHistoryPanel');
                        
                        if (historyTab && historyPanel) {
                            historyTab.classList.add('active');
                            historyPanel.classList.add('active');
                            console.log('تب تاریخچه به صورت دستی فعال شد');
                        }
                    }
                    
                    // بروزرسانی لیست تاریخچه
                    if (typeof renderQuizHistory === 'function') {
                        console.log('فراخوانی renderQuizHistory');
                        renderQuizHistory();
                    } else {
                        console.error('تابع renderQuizHistory در دسترس نیست');
                    }
                } catch (error) {
                    console.error('خطا در کلیک روی دکمه تاریخچه:', error);
                    showNotification('خطا در بارگذاری تاریخچه: ' + error.message, 'error');
                }
            });
            
            console.log('رویداد دکمه تاریخچه با موفقیت تنظیم شد');
        } catch (error) {
            console.error('خطا در تنظیم رویداد دکمه تاریخچه:', error);
        }
    })();

    // افزودن مستقیم تابع renderQuizQuestions به window
    if (typeof window.renderQuizQuestions !== 'function') {
        window.renderQuizQuestions = function(quiz) {
            console.log('فراخوانی تابع renderQuizQuestions از نسخه جهانی');
            try {
                // تابع اصلی را فراخوانی می‌کنیم اگر وجود داشته باشد
                if (typeof renderQuizQuestions === 'function' && renderQuizQuestions !== window.renderQuizQuestions) {
                    return renderQuizQuestions(quiz);
                }
                
                // در غیر این صورت به صورت مستقیم نمایش می‌دهیم
                const questionsContainer = document.getElementById('quizQuestions');
                if (!questionsContainer) {
                    console.error('کانتینر سوالات یافت نشد');
                    showNotification('خطا: کانتینر سوالات یافت نشد', 'error');
                    return;
                }
                
                if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) {
                    console.error('آزمون نامعتبر است:', quiz);
                    showNotification('خطا: آزمون نامعتبر است', 'error');
                    return;
                }
                
                questionsContainer.innerHTML = '';
                
                quiz.questions.forEach((question, index) => {
                    if (!question || !question.text) return;
                    
                    const questionEl = document.createElement('div');
                    questionEl.className = 'quiz-question';
                    questionEl.innerHTML = `
                        <div class="question-text">${index + 1}. ${question.text}</div>
                        <div class="question-options" id="options-${index}"></div>
                    `;
                    questionsContainer.appendChild(questionEl);
                    
                    const optionsContainer = document.getElementById(`options-${index}`);
                    if (!optionsContainer) return;
                    
                    if (question.type === 'multichoice' && Array.isArray(question.options)) {
                        question.options.forEach((option, optIndex) => {
                            const optEl = document.createElement('div');
                            optEl.className = 'option-item';
                            optEl.innerHTML = `
                                <input type="radio" id="q${index}-opt${optIndex}" name="q${index}" value="${option}">
                                <label for="q${index}-opt${optIndex}">${option}</label>
                            `;
                            optionsContainer.appendChild(optEl);
                        });
                    } else if (question.type === 'truefalse' || !question.options) {
                        const trueEl = document.createElement('div');
                        trueEl.className = 'option-item';
                        trueEl.innerHTML = `
                            <input type="radio" id="q${index}-true" name="q${index}" value="true">
                            <label for="q${index}-true">صحیح</label>
                        `;
                        
                        const falseEl = document.createElement('div');
                        falseEl.className = 'option-item';
                        falseEl.innerHTML = `
                            <input type="radio" id="q${index}-false" name="q${index}" value="false">
                            <label for="q${index}-false">غلط</label>
                        `;
                        
                        optionsContainer.appendChild(trueEl);
                        optionsContainer.appendChild(falseEl);
                    }
                });
                
                // فعال کردن تب مربوطه
                if (typeof activateQuizTab === 'function') {
                    activateQuizTab('taker');
                } else if (typeof activateTab === 'function') {
                    activateTab('taker');
                }
                
                console.log('آزمون با موفقیت نمایش داده شد');
            } catch (error) {
                console.error('خطا در نمایش آزمون:', error);
                showNotification('خطا در نمایش آزمون: ' + error.message, 'error');
            }
        };
    }

    function loadQuizFromHistory(quizId) {
        // ... existing code ...
    }

    // اضافه کردن رویداد کلیک مستقیم به دکمه‌های بارگیری آزمون
    (function setupDirectLoadButtons() {
        console.log('راه‌اندازی مستقیم دکمه‌های بارگیری آزمون');
        
        // یک رویداد روی document برای هندل کردن تمام کلیک‌های دکمه بارگیری
        document.addEventListener('click', function(event) {
            // بررسی اینکه آیا روی دکمه بارگیری کلیک شده است
            if (event.target && (
                event.target.classList.contains('quiz-history-load-button') || 
                (event.target.parentElement && event.target.parentElement.classList.contains('quiz-history-load-button'))
            )) {
                event.preventDefault();
                event.stopPropagation();
                
                // پیدا کردن دکمه
                const loadButton = event.target.classList.contains('quiz-history-load-button') 
                    ? event.target 
                    : event.target.parentElement;
                
                // گرفتن شناسه آزمون
                const quizId = loadButton.getAttribute('data-quiz-id');
                console.log('کلیک مستقیم روی دکمه بارگیری آزمون با شناسه:', quizId);
                
                if (!quizId) {
                    console.error('شناسه آزمون یافت نشد');
                    showNotification('خطا: شناسه آزمون یافت نشد', 'error');
                    return;
                }
                
                try {
                    // فراخوانی مستقیم تابع loadQuizFromHistory
                    console.log('فراخوانی مستقیم تابع loadQuizFromHistory');
                    
                    // اگر تابع در حوزه عمومی موجود است
                    if (typeof window.loadQuizFromHistory === 'function') {
                        window.loadQuizFromHistory(quizId);
                    }
                    // اگر تابع در حوزه فعلی موجود است
                    else if (typeof loadQuizFromHistory === 'function') {
                        loadQuizFromHistory(quizId);
                    }
                    // در صورت عدم دسترسی، بارگذاری مستقیم
                    else {
                        console.error('تابع loadQuizFromHistory یافت نشد - تلاش برای بارگذاری مستقیم');
                        
                        // بارگذاری تاریخچه
                        const history = localStorage.getItem('quizHistory');
                        if (!history) {
                            showNotification('تاریخچه آزمون یافت نشد', 'error');
                            return;
                        }
                        
                        // پیدا کردن آزمون با شناسه داده شده
                        const historyItems = JSON.parse(history);
                        const quizItem = historyItems.find(item => item.id == quizId);
                        
                        if (!quizItem) {
                            showNotification('آزمون مورد نظر یافت نشد', 'error');
                            return;
                        }
                        
                        // تنظیم آزمون جاری
                        const quiz = quizItem.quiz || quizItem;
                        window.currentQuiz = quiz;
                        window.userAnswers = {};
                        
                        // نمایش آزمون
                        if (typeof window.renderQuizQuestions === 'function') {
                            window.renderQuizQuestions(quiz);
                        }
                        
                        // فعال کردن تب آزمون
                        if (typeof activateQuizTab === 'function') {
                            activateQuizTab('taker');
                        } else if (typeof activateTab === 'function') {
                            activateTab('taker');
                        }
                        
                        showNotification('آزمون با موفقیت بارگذاری شد', 'success');
                    }
                } catch (error) {
                    console.error('خطا در بارگذاری آزمون:', error);
                    showNotification('خطا در بارگذاری آزمون: ' + error.message, 'error');
                }
            }
        });
        
        console.log('رویداد کلیک مستقیم برای دکمه‌های بارگیری آزمون راه‌اندازی شد');
    })();

    // تابع مستقل برای بارگیری آزمون - با کمترین وابستگی به سایر کدها
    function directLoadQuizFromHistory(quizId) {
        try {
            console.log('بارگیری مستقیم آزمون از تاریخچه با شناسه:', quizId);
            
            // بررسی شناسه آزمون
            if (!quizId) {
                alert('خطا: شناسه آزمون یافت نشد');
                return false;
            }
            
            // بارگیری تاریخچه از localStorage
            let history = [];
            try {
                const historyData = localStorage.getItem('quizHistory');
                if (historyData) {
                    history = JSON.parse(historyData);
                }
            } catch (storageError) {
                console.error('خطا در خواندن تاریخچه از localStorage:', storageError);
            }
            
            if (!history || history.length === 0) {
                alert('تاریخچه آزمون خالی است');
                return false;
            }
            
            // پیدا کردن آزمون با شناسه
            let quizItem = null;
            for (let i = 0; i < history.length; i++) {
                const item = history[i];
                if (item.id == quizId || item.id === parseInt(quizId) || parseInt(item.id) === parseInt(quizId)) {
                    quizItem = item;
                    break;
                }
            }
            
            if (!quizItem) {
                alert('آزمون با شناسه مورد نظر یافت نشد');
                return false;
            }
            
            console.log('آزمون یافت شد:', quizItem);
            
            // استخراج آزمون
            let quiz = null;
            if (quizItem.quiz && quizItem.quiz.questions) {
                quiz = quizItem.quiz;
            } else if (quizItem.questions) {
                quiz = quizItem;
            } else {
                console.error('ساختار آزمون نامعتبر است:', quizItem);
                alert('ساختار آزمون نامعتبر است');
                return false;
            }
            
            // تنظیم آزمون جاری
            window.currentQuiz = quiz;
            window.userAnswers = {};
            
            console.log('آزمون برای نمایش:', quiz);
            
            // نمایش سوالات
            const questionsContainer = document.getElementById('quizQuestions');
            if (questionsContainer) {
                // پاک کردن محتوای قبلی
                questionsContainer.innerHTML = '';
                
                // ایجاد سوالات
                if (quiz.questions && Array.isArray(quiz.questions)) {
                    quiz.questions.forEach((question, index) => {
                        if (!question.text) return;
                        
                        const questionElement = document.createElement('div');
                        questionElement.className = 'quiz-question';
                        questionElement.innerHTML = `
                            <div class="question-text">${index + 1}. ${question.text}</div>
                            <div class="question-options" id="options-${index}"></div>
                        `;
                        questionsContainer.appendChild(questionElement);
                        
                        const optionsContainer = document.getElementById(`options-${index}`);
                        if (!optionsContainer) return;
                        
                        if (question.type === 'multichoice' && Array.isArray(question.options)) {
                            question.options.forEach((option, optIndex) => {
                                const optElement = document.createElement('div');
                                optElement.className = 'option-item';
                                optElement.innerHTML = `
                                    <input type="radio" id="q${index}-opt${optIndex}" name="q${index}" value="${option}">
                                    <label for="q${index}-opt${optIndex}">${option}</label>
                                `;
                                optionsContainer.appendChild(optElement);
                            });
                        } else if (question.type === 'truefalse' || !question.options) {
                            const trueElement = document.createElement('div');
                            trueElement.className = 'option-item';
                            trueElement.innerHTML = `
                                <input type="radio" id="q${index}-true" name="q${index}" value="true">
                                <label for="q${index}-true">صحیح</label>
                            `;
                            optionsContainer.appendChild(trueElement);
                            
                            const falseElement = document.createElement('div');
                            falseElement.className = 'option-item';
                            falseElement.innerHTML = `
                                <input type="radio" id="q${index}-false" name="q${index}" value="false">
                                <label for="q${index}-false">غلط</label>
                            `;
                            optionsContainer.appendChild(falseElement);
                        }
                    });
                } else {
                    questionsContainer.innerHTML = '<div class="quiz-error">سوالات آزمون یافت نشد</div>';
                }
            } else {
                console.error('کانتینر سوالات آزمون یافت نشد');
                alert('خطا: کانتینر سوالات یافت نشد');
                return false;
            }
            
            // فعال کردن تب آزمون‌دهی
            const quizTabs = document.querySelectorAll('.quiz-tab');
            const quizPanels = document.querySelectorAll('.quiz-panel');
            
            // غیرفعال کردن همه تب‌ها و پنل‌ها
            quizTabs.forEach(tab => tab.classList.remove('active'));
            quizPanels.forEach(panel => panel.classList.remove('active'));
            
            // فعال کردن تب و پنل آزمون‌دهی
            const takerTab = document.getElementById('showQuizTaker');
            const takerPanel = document.getElementById('quizTakerPanel');
            
            if (takerTab && takerPanel) {
                takerTab.classList.add('active');
                takerPanel.classList.add('active');
            } else {
                console.warn('تب یا پنل آزمون‌دهی یافت نشد');
            }
            
            alert('آزمون با موفقیت بارگذاری شد');
            return true;
        } catch (error) {
            console.error('خطا در بارگیری مستقیم آزمون:', error);
            alert('خطا در بارگیری آزمون: ' + error.message);
            return false;
        }
    }

    // اضافه کردن رویداد برای تمام دکمه‌های بارگیری آزمون
    document.addEventListener('DOMContentLoaded', function() {
        // رویداد اصلی برای کلیک‌ها در تمام صفحه
        document.addEventListener('click', function(event) {
            // بررسی کلیک روی دکمه بارگیری
            if (event.target.classList.contains('quiz-history-load-button') || 
                (event.target.parentElement && event.target.parentElement.classList.contains('quiz-history-load-button'))) {
                
                event.preventDefault();
                
                // پیدا کردن دکمه و شناسه آزمون
                const button = event.target.classList.contains('quiz-history-load-button') 
                    ? event.target 
                    : event.target.parentElement;
                
                const quizId = button.getAttribute('data-quiz-id');
                console.log('کلیک روی دکمه بارگیری با شناسه:', quizId);
                
                // بارگیری مستقیم آزمون
                directLoadQuizFromHistory(quizId);
            }
        });
        
        // بهبود رویدادهای موجود
        const historyItems = document.querySelectorAll('.quiz-history-item');
        historyItems.forEach(item => {
            const loadButton = item.querySelector('.quiz-history-load-button');
            if (loadButton) {
                const quizId = loadButton.getAttribute('data-quiz-id');
                loadButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log('کلیک از طریق رویداد اختصاصی با شناسه:', quizId);
                    directLoadQuizFromHistory(quizId);
                });
            }
        });
        
        console.log('رویدادهای بارگیری آزمون راه‌اندازی شدند');
    });

    // آپدیت تابع initQuizModule برای حذف فراخوانی توابع حذف شده
    function initQuizModule() {
        console.log("راه‌اندازی ماژول آزمون");
        
        // بارگذاری وضعیت آزمون
        loadQuizState();
        
        // تنظیم رویدادهای دکمه‌های تب
        document.getElementById('showQuizBuilder').addEventListener('click', function() {
            activateTab('builder');
        });
        
        document.getElementById('showQuizTaker').addEventListener('click', function() {
            activateTab('taker');
        });
        
        document.getElementById('showQuizResults').addEventListener('click', function() {
            activateTab('results');
        });
        
        // حذف فراخوانی توابع setupSaveDropdown و setupLoadQuizButton
        
        console.log("ماژول آزمون با موفقیت راه‌اندازی شد");
    }

    // اضافه کردن تابع renderQuizQuestions به فضای نام window برای دسترسی از سایر توابع
    window.renderQuizQuestions = renderQuizQuestions;
}); 

// فراخوانی تابع initQuizModule برای راه‌اندازی ماژول آزمون
initQuizModule();