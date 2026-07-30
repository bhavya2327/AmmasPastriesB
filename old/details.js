// image 


const grid=document.getElementById('card-grid');
const checkedIndices=[0,1,2,3];

const images=[
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg'
];

for(let i=0;i<images.length;i++){
const isChecked=checkedIndices.includes(i);
const card=document.createElement('div');
card.className='image-card animate-reveal flex flex-col items-center';
card.style.animationDelay=`${i*0.05}s`;

card.innerHTML=`
<div class="relative group w-full">
<div class="aspect-[4/5] w-full rounded-[13px] overflow-hidden  group-hover:shadow-lg transition-all duration-300">
<img src="${images[i % images.length]}" class="w-full rounded-[13px] h-full object-cover">
</div>

<button class="trash-btn absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow opacity-100 lg:opacity-0 transition-opacity flex items-center justify-center hover:text-red-500">
<i class="fa-solid fa-trash-can text-xs"></i>
</button>

<label class="absolute bottom-0 right-0 p-[15px] rounded-[10px] rounded-br-0 bg-white cursor-pointer custom-checkbox">
<input type="checkbox" class="hidden" ${isChecked ? 'checked' : ''}>
<div class="checkbox-box w-5 h-5 bg-white border border-gray-300 rounded flex items-center justify-center">
<i class="fa-solid fa-check text-[10px] hidden"></i>
</div>
</label>
</div>

<p class="lg:text-lg sm:text-base text-sm text-black mt-3 font-medium w-full truncate px-2">
Merry Christmas
</p>`;

grid.appendChild(card);
}

new Sortable(grid,{
animation:300,
ghostClass:'sortable-ghost',
chosenClass:'sortable-chosen',
dragClass:'sortable-drag',
easing:"cubic-bezier(0.22,1,0.36,1)",
onEnd:function(){
const cards=[...document.querySelectorAll('.image-card')];
const order=cards.map((card,index)=>index);
console.log('New Order:',order);
}
});

document.addEventListener('click',function(e){
const trashBtn=e.target.closest('.trash-btn');
if(!trashBtn) return;

const card=trashBtn.closest('.image-card');
card.style.transform='scale(.8)';
card.style.opacity='0';

setTimeout(()=>{
card.remove();
},300);
});
// videos

const vgrid=document.getElementById('videocard-grid');
const vcheckedIndices=[0,1,2,3];

const videos=[
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg',
'images/image.jpg'];

for(let i=0;i<videos.length;i++){
const isChecked=vcheckedIndices.includes(i);
const vcard=document.createElement('div');
vcard.className='video-card animate-reveal flex flex-col items-center';
vcard.style.animationDelay=`${i*0.05}s`;

vcard.innerHTML=`
<div class="relative group w-full">
<div class="aspect-[4/5] w-full rounded-[13px] overflow-hidden  group-hover:shadow-lg transition-all duration-300">
<img src="${videos[i % videos.length]}" class="w-full rounded-[13px] h-full object-cover">
</div>

<button onclick="deleteCard(this)"
        type="button" class="trash-btn absolute top-2 right-2 w-8 h-8 bg-white rounded-full shadow opacity-100 lg:opacity-0 transition-opacity flex items-center justify-center hover:text-red-500">
<i class="fa-solid fa-trash-can text-xs"></i>
</button>
<div onclick="videoOpen('https://www.youtube.com/embed/Cmtoos9Qwwo?si=XYuIHJ8gUY_8kzcG')" class="text-white bg-[#F36E21]/80 flex items-center justify-center lg:w-[50px] sm:w-[40px] w-[30px] aspect-square absolute bottom-0 left-0 right-0 top-0 m-auto rounded-full left-0">
    <i class="fa-regular fa-circle-play lg:text-3xl sm:text-2xl text-xl"></i> 
</div>

<label class="absolute bottom-0 right-0 p-[15px] rounded-[10px] rounded-br-0 bg-white cursor-pointer custom-checkbox">
<input type="checkbox" class="hidden" ${isChecked ? 'checked' : ''}>
<div class="checkbox-box w-5 h-5 bg-white border border-gray-300 rounded flex items-center justify-center">
<i class="fa-solid fa-check text-[10px] hidden"></i>
</div>
</label>
</div>

<p class="lg:text-lg sm:text-base text-sm text-black mt-3 font-medium w-full truncate px-2">
Merry Christmas
</p>`;

vgrid.appendChild(vcard);
}

new Sortable(vgrid,{
animation:300,
ghostClass:'sortable-ghost',
chosenClass:'sortable-chosen',
dragClass:'sortable-drag',
easing:"cubic-bezier(0.22,1,0.36,1)",
onEnd:function(){
const vcards=[...document.querySelectorAll('.video-card')];
const vorder=vcards.map((vcard,index)=>index);
console.log('New Order:',vorder);
}
});
function deleteCard(vbtn) {
    const vcard = vbtn.closest('.video-card');

    vcard.style.transform = 'scale(.8)';
    vcard.style.opacity = '0';

    setTimeout(() => {
        vcard.remove();
    }, 300);
}
// anounce

 // Function for the FIRST submit button (Text Area)
    function submitNewAnnouncement() {
        const text = document.getElementById('announcementInput').value;
        if (text.trim() === "") {
            alert("Please enter a message before submitting.");
            return;
        }
        console.log("Submitting New Message:", text);
        alert("New Announcement Submitted!");
        document.getElementById('announcementInput').value = ""; // Clear after submit
    }