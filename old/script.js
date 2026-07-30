loadComponent('header.html', '.header').then(() => { currentPage();}).catch(error => console.error('Error loading header:', error));
// loadComponent('footer.html', '.footer').catch(error => console.error('Error loading footer:', error));




















//--------------------------------- ALL FUNCTION-----------------------------------
// // videopopup
function videoOpen(url) {
  const iframe = document.getElementById('videoIframe');

  if (url.includes('?')) {
    iframe.src = url + '&autoplay=1&mute=1';
  } else {
    iframe.src = url + '?autoplay=1&mute=1';
  }

  document.getElementById('videoOverlay').classList.remove('hidden');
}
function videoClose() {
  document.getElementById('videoOverlay').classList.add('hidden');
  document.getElementById('videoIframe').src = '';
}
function videoOverlay(event) {
  const container = document.getElementById('videoContainer');
  if (!container.contains(event.target)) {
    videoClose();
  }
}
function loadComponent(url, elementSelector) {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response.text();
    })
    .then(data => {
      const element = document.querySelector(elementSelector);
      if (element) {
        element.innerHTML = data;
      } else {
        throw new Error(`Element ${elementSelector} not found`);
      }
    })
    .catch(error => console.error('Error loading component:', error));
}
function currentPage() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll(".menu-link").forEach(link => {
        const href = link.getAttribute("href");

        if (href === currentPage) {
            link.classList.add("menu-active");
        } else {
            link.classList.remove("menu-active");
        }
    });
}
function toggleSidebar(){
document.getElementById('sidebar').classList.toggle('-translate-x-full');
document.getElementById('overlay').classList.toggle('hidden');
}


// branch
 // Function to Open Modal
        function openModal() {
            document.getElementById('branchModal').classList.remove('hidden');
        }

        // Function to Close Modal
        function closeModal() {
            document.getElementById('branchModal').classList.add('hidden');
        }

        // Close modal when clicking outside of it
       

        // FORM SUBMIT FUNCTION
        function handleBranchSubmit() {
            const branchName = document.getElementById('branchName').value;
            const state = document.getElementById('stateName').value;

            if (branchName.trim() === "") {
                alert("Please enter a branch name.");
                return;
            }

            // Logic to handle data
            console.log("Adding New Branch...");
            console.log("Branch Name:", branchName);
            console.log("State:", state);

            // UI Feedback
            alert(`Success! ${branchName} added to ${state}.`);
            
            // Reset and Close
            document.getElementById('branchName').value = "";
            closeModal();
        }


        // clone popup
        // 1. OPEN POPUP
        function openBranchPopup() {
          console.log(true+"dsfsdf")
            document.getElementById('branchPopupWrapper').classList.remove('hidden');
            // document.body.style.overflow = 'hidden'; // Disable scroll when popup open
        }

        // 2. CLOSE POPUP
        function closeBranchPopup() {
            document.getElementById('branchPopupWrapper').classList.add('hidden');
            // document.body.style.overflow = 'auto'; // Enable scroll
        }

           // 1. SELECT ALL FUNCTION
        function toggleAllCheckboxes(master) {
            const items = document.querySelectorAll('.branch-item');
            items.forEach(checkbox => {
                checkbox.checked = master.checked;
            });
        }

        // 2. LOGIC TO UPDATE MASTER CHECKBOX IF USER UNCHECKS ONE ITEM
        function checkMasterStatus() {
            const master = document.getElementById('selectAllBtn');
            const items = document.querySelectorAll('.branch-item');
            const checkedCount = document.querySelectorAll('.branch-item:checked').length;
            
            // If all individual items are checked, check the master box
            master.checked = (items.length === checkedCount);
            
            // Indeterminate state (optional UI polish)
            master.indeterminate = (checkedCount > 0 && checkedCount < items.length);
        }

        // 3. APPLY FUNCTION (Onclick call)
        function applySelection() {
            const selected = [];
            const checkedItems = document.querySelectorAll('.branch-item:checked');
            
            checkedItems.forEach(item => {
                selected.push(item.value);
            });

            if(selected.length === 0) {
                alert("Please select at least one branch.");
                closeBranchPopup();
            } else {
                console.log("Selected Branches:", selected);
                alert("Applied selection for " + selected.length + " branches.");
                closeBranchPopup();
                // Add code here to close modal or send data to server
            }
        }
   