document.addEventListener('DOMContentLoaded', function () {
    checkForBackNavigation(); // Ensure back button resets animation
    initFormHandling();
    createBackgroundElements();
    enhanceFormLayout();
    addLogo();
    addDecorativeElements();
    initializeFloatingLabels();
});

/** Handles form submission with exit animation and loading screen */
function initFormHandling() {
    const form = document.getElementById('travelForm');
    const loadingScreen = document.getElementById('loadingScreen');
    const welcomeText = document.getElementById('welcomeText');

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        // Slide out animation for the form
        form.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
        form.style.transform = 'translateY(-20px)';
        form.style.opacity = '0';

        // Hide the welcome text
        welcomeText.style.display = 'none';

        // Show the loading animation after form disappears
        setTimeout(() => {
            form.style.display = 'none';
            loadingScreen.style.display = 'block';

            // Save animation state in session storage
            sessionStorage.setItem("formSubmitted", "true");
        }, 600); // Wait for form animation to complete

        // Submit form after delay
        setTimeout(() => {
            form.submit();
        }, 2500); // Adjust delay as needed
    });
}

/** Detects back navigation and resets animation */
function checkForBackNavigation() {
    if (sessionStorage.getItem("formSubmitted") === "true") {
        // Reset form visibility
        document.getElementById('travelForm').style.display = 'block';
        document.getElementById('travelForm').style.opacity = '1';
        document.getElementById('travelForm').style.transform = 'translateY(0)';
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('welcomeText').style.display = 'block';

        // 🔥 Restore form spacing when navigating back
        document.getElementById('travelForm').style.gap = "1.5rem";

        // Clear sessionStorage to prevent repeat animation
        sessionStorage.removeItem("formSubmitted");
    }
}


// Force reload if user navigates back to stop animation replay
window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        location.reload(); // Forces the page to reload when navigating back
    }
});

/** Initializes floating label effect for input fields */
function initializeFloatingLabels() {
    const inputs = document.querySelectorAll('.input-container input, .input-container select');

    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.querySelector('label').classList.add('active');
        });

        input.addEventListener('blur', () => {
            if (!input.value) {
                input.parentElement.querySelector('label').classList.remove('active');
            }
        });

        // Trigger label position on page load
        if (input.value) {
            input.parentElement.querySelector('label').classList.add('active');
        }
    });
}

/** Creates animated background elements */
function createBackgroundElements() {
    const count = 5;
    const container = document.body;

    for (let i = 0; i < count; i++) {
        const element = document.createElement('div');
        element.classList.add('bg-element');

        // Random size between 100px and 300px
        const size = Math.random() * 200 + 100;
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;

        // Random position
        element.style.top = `${Math.random() * 100}%`;
        element.style.left = `${Math.random() * 100}%`;

        // Add animation
        element.style.animation = `float ${Math.random() * 6 + 4}s ease-in-out infinite`;
        element.style.animationDelay = `${Math.random() * 5}s`;

        container.appendChild(element);
    }
}

/** Converts form to enhanced layout with floating labels */
function enhanceFormLayout() {
    const form = document.getElementById('travelForm');
    const formElements = form.querySelectorAll('label, select, input, button');

    // Clear form and prepare for new layout
    form.innerHTML = '';

    // Group form elements
    const formGroups = {};
    let currentLabel = null;

    formElements.forEach(element => {
        if (element.tagName === 'LABEL') {
            currentLabel = element;
            const forAttr = element.getAttribute('for');
            formGroups[forAttr] = {
                label: element,
                input: null
            };
        } else if (element.tagName === 'SELECT' || element.tagName === 'INPUT') {
            const id = element.getAttribute('id');
            if (formGroups[id]) {
                formGroups[id].input = element;
            }
        } else if (element.tagName === 'BUTTON') {
            // Handle button separately
            formGroups['submit'] = { button: element };
        }
    });

    // Create new form layout
    Object.keys(formGroups).forEach((key, index) => {
        if (key === 'submit') return;

        const group = document.createElement('div');
        group.classList.add('form-group');
        group.style.animationDelay = `${index * 0.1}s`;

        const container = document.createElement('div');
        container.classList.add('input-container');

        const input = formGroups[key].input.cloneNode(true);
        const label = formGroups[key].label.cloneNode(true);

        // Add placeholder for floating label effect
        if (input.tagName === 'INPUT') {
            input.setAttribute('placeholder', ' ');
        }

        container.appendChild(input);
        container.appendChild(label);
        group.appendChild(container);
        form.appendChild(group);
    });

    // Add submit button
    const submitGroup = document.createElement('div');
    submitGroup.classList.add('form-group');
    submitGroup.style.animationDelay = `${Object.keys(formGroups).length * 0.1}s`;

    const button = formGroups['submit'].button.cloneNode(true);
    submitGroup.appendChild(button);
    form.appendChild(submitGroup);
}

/** Adds logo to the page */
function addLogo() {
    const logo = document.createElement('div');
    logo.classList.add('logo');

    const logoIcon = document.createElement('div');
    logoIcon.classList.add('logo-icon');
    logoIcon.innerHTML = '✈️';

    logo.appendChild(logoIcon);
    document.body.appendChild(logo);
}

/** Adds decorative elements to the page */
function addDecorativeElements() {
    const decoration = document.createElement('div');
    decoration.classList.add('travel-decoration');
    document.body.appendChild(decoration);
}

// Prevent scrolling on the whole page
document.body.addEventListener('wheel', function (e) {
    e.preventDefault();
}, { passive: false });

// Allow scrolling only within the form
document.getElementById('travelForm').addEventListener('wheel', function (e) {
    const form = this;
    const maxScroll = form.scrollHeight - form.clientHeight;

    if ((form.scrollTop === 0 && e.deltaY < 0) ||
        (form.scrollTop >= maxScroll && e.deltaY > 0)) {
        e.preventDefault();
    }
    e.stopPropagation();
}, { passive: false });


function submitform() {
    // Get the first element with the class 'logo-icon'
    const logoIcon = document.querySelector('.logo-icon');
    
    // If you have multiple elements with the class and want to show all of them
    // const logoIcons = document.querySelectorAll('.logo-icon');
    
    // Make it visible by changing display from none to block
    logoIcon.style.display = 'block';
}