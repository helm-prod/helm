export const ENDECA_SNIPPET = String.raw`<style type="text/css">

.linktext{
       color: #ffffff;
       font-size: 16px;
       font-weight: bold;
}
p, h1 {
   color: #252525;
   font-family: 'Montserrat';
}
h2.wog {
   color: #0096c3;
   font-family: 'Montserrat';
   font-weight: bold;
   font-size: 2rem;
}
p.title{
   font-size: 1rem;
   font-weight: 700;
   text-align: left;
}
p.copy{
     font-size: 16px;
     font-weight: 500;
     text-align: left;
     line-height: 22px;
     margin-top: -10px;
}
p.desc {
     font-size: 16px;
     font-weight: 500;
     text-align: left;
     margin-top: -10px;
}
p.intro {
     font-size: 18px;
     font-weight: 500;
     text-align: center;
}
p.reg {
     font-size: 16px;
     font-weight: 700;
     text-align: left;
}
p.coin {
   font-size: 1rem;
   font-weight: 700;
   text-align: left;
}
p.coinmain {
     font-size: 16px;
     font-weight: 500;
     text-align: left;
   margin-top: -10px;
}
h1.eventname {
   font-size: 24px;
   font-weight: 700;
   text-align: left;
}
h1.eventdate {
   font-size: 24px;
   text-align: left;
   margin-top: -10px;
   font-weight: 500;
}
button {
        display: block;
        background-color: #0097c5;
        border: none;
        width: 150px;
        height: 50px;
        color: #ffffff !important;
        text-align: center;
 }
.cta-buttons {
    display: flex;
    justify-content: flex-start;
    margin-top: 10px;
  }
.cta-button {
    display: inline-block;
    background-color: #003057;
    border: none;
    padding: 10px 20px;
    margin-right: 10px;
    color: #ffffff;
    font-size: 16px;
    font-weight: bold;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
.cta-button:hover {
    background-color: #001f3d;
  }
.gallery-item {
  text-align: center;
  margin-bottom: 30px;
}
.gallery-item .image-container {
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  padding: 10px;
}
.gallery-item img {
  max-width: 362px;
  max-height: 338px;
  object-fit: contain;
}
.gallery-item .eventname {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 5px;
}
.gallery-item .location {
  font-size: 18px;
  text-align: center;
  margin-bottom: 10px;
}
.gallery-item .eventdate {
  font-size: 20px;
  text-align: center;
  margin-top: 10px;
  margin-bottom: 10px;
}
.gallery-item .desc {
  font-size: 16px;
  font-weight: 500;
  text-align: justify;
  margin-top: 10px;
  margin-bottom: 10px;
}
.gallery-item .reg {
  font-size: 16px;
  font-weight: 700;
  text-align: left;
  margin-bottom: 10px;
}
.gallery-item .cta-buttons {
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
}
.gallery-item .cta-button {
  display: inline-block;
  background-color: #1184B7;
  border: none;
  padding: 10px 20px;
  margin-right: 10px;
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.3s ease;
}
.gallery-item .cta-button:hover {
  background-color: #0c6d97;
}
@media only screen and (min-width: 767px) { 
 .mobileonly {
display: none;
}
}
@media only screen and (max-width: 766px) {
 .hidden-mobile {
display: none;
}
h2.wog {
   color: #0096c3;
   font-family: 'Montserrat';
   font-weight: bold;
   font-size: 26px;
}
p.intro {
     font-size: 14px;
     font-weight: 500;
     text-align: center;
}
.gallery-item .eventname {
  font-size: 1rem;
  font-weight: 700;
  text-align: left;
  margin-bottom: 5px;
}
.gallery-item .eventdate {
  font-size: 1rem;
  text-align: left;
  margin-top: 10px;
  margin-bottom: 10px;
}
.gallery-item .desc {
  font-size: 12px;
  font-weight: 500;
  text-align: justify;
  margin-top: 10px;
  margin-bottom: 10px;
}
.gallery-item .reg {
p.desc {
     font-size: 12px;
     font-weight: 500;
     text-align: left;
}
p.coinmain {
     font-size: 12px;
     font-weight: 500;
     text-align: left;
   margin-top: -10px;
}
}
</style>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,600;1,700&family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Raleway:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&display=swap" rel="stylesheet">

<div class="container">
  <div class="row mt-4 hidden-mobile">
    <div class="col-12"><img alt="Waves Of Gratitude Welcome" class="img-fluid" src="/assets/Static/WOG/25_Vendor Partner WOG-DT-HEADER(UPDATE).jpg"  /></div>
  </div>

  <div class="row mt-4 mobileonly">
    <div class="col-12"><img alt="Waves Of Gratitude Welcome" class="img-fluid" src="/assets/Static/WOG/25_Vendor Partner WOG-HEADER-Mobile(UPDATE).jpg"  />
    </div>
  </div>

  <div class="row mt-md-n5">
    <div class="col-12">
      <picture>
        <source media="(max-width:766px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Page Break-Mobile.jpg" />
        <source media="(min-width: 767px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Page Break-DT.jpg"  />
        <img alt="Wave Divider" class="img-fluid" src="/assets/Static/WOG/25_Vendor Partner WOG Page Break-DT.jpg"  />
      </picture>
    </div>
  </div>
  <div class="row mt-4">
    <div class="col-12">
      <p class="intro">The NEX is excited to host the Waves of Gratitude saluting their service event series. Grab the family to create memories and have fun at special events throughout the year. From 5K runs, veteran recognition giveaways, and holiday celebrations—there's something for everyone. Join us for these upcoming events!</p>
    </div>
  </div>

<div class="row mt-3 mt-md-5">
<div class="col-12"><h2 class="wog">Event Highlights</h2></div>
      </div>

<script>var CRL8_SITENAME = 'nexcom-t6mqhu';!function(){var e=window.crl8=window.crl8||{},n=!1,i=[];e.ready=function(e){n?e():i.push(e)},e.pixel=e.pixel||function(){e.pixel.q.push(arguments)},e.pixel.q=e.pixel.q||[];var t=window.document,o=t.createElement("script"),c=e.debug||-1!==t.location.search.indexOf("crl8-debug=true")?"js":"min.js";o.async=!0,o.src=t.location.protocol+"//edge.curalate.com/sites/"+CRL8_SITENAME+"/site/latest/site."+c,o.onload=function(){n=!0,i.forEach(function(e){e()})};var r=t.getElementsByTagName("script")[0];r.parentNode.insertBefore(o,r.nextSibling)}();</script>

      <div class="row mt-2">
        <div class="col-12">
          <div data-crl8-container-id="gallery-k1dCMhXw"></div>
        </div>
      </div>

      <div id="wog-upcoming-events"></div>

<div class="row mt-5">
<div class="col-12"><h2 class="wog">Military Recognition</h2></div>
      </div>

  <div class="row mt-4">
    <div class="col-6 col-md-3">
      <img alt="Veterans Day Coin" class="img-fluid" src="/assets/Static/WOG/25-15W_WOG_C1-NEW.jpg" style="filter: grayscale(30%); width: 100%; height: auto;" />
      <p class="title">Veterans Day Coin</p>
        <p class="copy">Free limited-edition commemorative coin given in appreciation to veterans on November 11.</p>
      <p style="text-align: left; font-weight: 500; font-size: 12px; margin-top: -20px;">*While supplies last</p>
    </div>
    <div class="col-6 col-md-3">
      <img alt="National Vietnam War Veterans Day" class="img-fluid" src="/assets/Static/WOG/23-09W_WOG-C13.jpg" style="filter: grayscale(30%); width: 100%; height: auto;" />
      <p class="title">National Vietnam War Veterans Day</p>
              <p class="copy">Honoring service, valor, and sacrifice. Receive a free lapel pin on March 29.</p>
    </div>
    <div class="col-6 col-md-3">
      <img alt="Sailor of The Year Program" class="img-fluid" src="/assets/Static/WOG/23-09W_WOG-C14.jpg" style="filter: grayscale(30%); width: 100%; height: auto;" />
     <p class="title">Sailor of The Year Program</p>
         <p class="copy">NEXCOM celebrates and honors 18 top selected Sailors, who represent the best of the U.S. Navy.</p>
    </div>
    <div class="col-6 col-md-3">
      <img alt="CPO" class="img-fluid" src="/assets/Static/WOG/25-15W_WOG_C2-NEW.jpg" style="filter: grayscale(30%); width: 100%; height: auto;" />
       <p class="title">CPO</p>
        <p class="copy">The NEX gives away a free CPO Challenge Coin to Chief Selectees to honor their service.</p>
    </div>
  </div>

 <div class="row mt-5">
<div class="col-12"><h2 class="wog">Previous Events</h2></div>
      </div>

  <div id="wog-past-events-container"></div>

<div class="row mt-5">
<div class="col-12"><h2 class="wog">5-Star Anchor Partners</h2></div>

<div class="col-12">
<div data-crl8-container-id="gallery-WNycHxNB"></div>
</div>
      </div>

  <div class="row mt-4">
    <div class="col-12">
      <picture>
        <source media="(max-width: 799px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Mobile_01.jpg">
        <source media="(min-width: 992px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Web- DT_01.jpg">
        <img src="/assets/Static/WOG/25_Vendor Partner WOG Web- DT_01.jpg" style="width: 100%;" alt="5 Star for WOG page"/>
      </picture>
    </div>
  </div>

<div class="col-12 mt-2"><picture> 
 <source media="(max-width: 799px)" srcset="/assets/Static/VendorPartners/25_Vendor Partner Web-Mobile_02.jpg"> 
 <source media="(min-width: 992px)" srcset="/assets/Static/VendorPartners/25_Vendor Partner Web-DT_02.jpg"> 
 <img src="/assets/Static/VendorPartners/25_Vendor Partner Web-DT_02.jpg" style="width: 100%;" alt="4 Star"/></picture></div>

<div class="col-12 mt-2"><picture> 
 <source media="(max-width: 799px)" srcset="/assets/Static/WOG/25_VENDOR PARTNER WEB-MOBILE_03-NEW.jpg"> 
 <source media="(min-width: 992px)" srcset="/assets/Static/WOG/25_VENDOR PARTNER WEB-DT_03-NEW.jpg"> 
 <img src="/assets/Static/WOG/25_VENDOR PARTNER WEB-DT_03-NEW.jpg" style="width: 100%;" alt="3 Star"/></picture></div>

<div class="col-12 mt-2"><picture> 
 <source media="(max-width: 799px)" srcset="/assets/Static/VendorPartners/25_Vendor Partner Web-Mobile_04.jpg"> 
 <source media="(min-width: 992px)" srcset="/assets/Static/VendorPartners/25_Vendor Partner Web-DT_04.jpg"> 
 <img src="/assets/Static/VendorPartners/25_Vendor Partner Web-DT_04.jpg" style="width: 100%;" alt="2 Star"/></picture></div>

<div class="col-12 mt-2"><picture> 
 <source media="(max-width: 799px)" srcset="/assets/Static/WOG/25_VENDOR PARTNER WEB-MOBILE_05.jpg"> 
 <source media="(min-width: 992px)" srcset="/assets/Static/WOG/25_VENDOR PARTNER WEB-DT_05.jpg"> 
 <img src="/assets/Static/WOG/25_VENDOR PARTNER WEB-DT_05.jpg" style="width: 100%;" alt="1 Star"/></picture></div>

  <div class="row mt-4">
    <div class="col-12">
      <picture>
        <source media="(max-width: 799px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Mobile_02(UPDATE).jpg">
        <source media="(min-width: 992px)" srcset="/assets/Static/WOG/25_Vendor Partner WOG Web-DT_02(UPDATE).jpg">
        <img src="/assets/Static/WOG/25_Vendor Partner WOG Web-DT_02(UPDATE).jpg" style="width: 100%;" alt="Race Partners"/>
      </picture>
    </div>
  </div>

<p>&nbsp;</p>

<div class="col-12 my-2" style="text-align: center;">These partnerships do not imply endorsement of any commercial product, process, or service by any entity of the U.S. Government.</div>
</div>
    
  </div>
</div>

<script>
(function() {
  var API = 'https://helm.nexweb.dev/api/wog/public';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(start, end) {
    var opts = { month: 'long', day: 'numeric', year: 'numeric' };
    var s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts);
    if (!end) return s;
    var e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts);
    return s + ' \u2013 ' + e;
  }

  function renderUpcoming(events) {
    var container = document.getElementById('wog-upcoming-events');
    if (!container || !events.length) return;
    var html = '<div class="row mt-2">';
    events.forEach(function(ev) {
      html += '<div class="col-md-3 col-6 gallery-item">';
      html += '<div class="image-container"><img alt="' + esc(ev.event_name) + '" class="img-fluid" src="' + esc(ev.event_image_url) + '" /></div>';
      html += '<p class="eventname">' + esc(ev.event_name) + '</p>';
      html += '<p class="eventdate">' + formatDate(ev.start_date, ev.end_date) + '</p>';
      if (ev.description) html += '<p class="desc hidden-mobile">' + esc(ev.description) + '</p>';
      if (ev.special_notes) html += '<p class="desc hidden-mobile">' + esc(ev.special_notes) + '</p>';
      var hasCta = ev.cta1_title || ev.cta2_title;
      if (hasCta) {
        html += '<div class="cta-buttons">';
        if (ev.cta1_title && ev.cta1_link) html += '<a href="' + esc(ev.cta1_link) + '" class="cta-button">' + esc(ev.cta1_title) + '</a>';
        if (ev.cta2_title && ev.cta2_link) html += '<a href="' + esc(ev.cta2_link) + '" class="cta-button">' + esc(ev.cta2_title) + '</a>';
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderPast(events) {
    var container = document.getElementById('wog-past-events-container');
    if (!container || !events.length) return;
    var html = '<div class="row mt-4">';
    events.forEach(function(ev) {
      html += '<div class="col-md-3 col-6">';
      html += '<img alt="' + esc(ev.event_name) + '" class="img-fluid" src="' + esc(ev.event_image_url) + '" style="filter:grayscale(30%);width:100%;height:auto;" />';
      html += '<p class="title">' + esc(ev.event_name) + '</p>';
      html += '<p class="copy">' + formatDate(ev.start_date, ev.end_date) + '</p>';
      if (ev.description) html += '<p class="copy hidden-mobile">' + esc(ev.description) + '</p>';
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  fetch(API)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      renderUpcoming(data.upcoming || []);
      renderPast(data.past || []);
    })
    .catch(function() {});
})();
</script>
`
