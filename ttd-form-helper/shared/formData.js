// Reference data used by the Srivari Seva / Seva Group forms.
// Plain public reference lists (temples, states/districts, education & profession
// taxonomies, countries) — carried over verbatim so autofill keeps matching the
// exact option text the TTD site's own dropdowns expect.

export const TTD_TEMPLES = [
  "SV Temple cum Information Centre, Chennai",
  "SV Temple  cum Information Centre, New Delhi",
  "SV Temple cum Information Centre, Bangalore",
  "SV Temple cum Information Centre, Mumbai",
  "SV Temple cum Information Centre, Himayath Nagar, Hyderabad",
  "TTD Information Centre, Vellore",
  "SV Temple, Kurukshetra, Chennai",
  "SV Temple, Kanyakumari, Chennai",
  "SV Temple, Jubilee Hills, Hyderabad, Chennai",
  "Sri Chandra Mouleswara Swamy Temple, Rishikesh, Chennai",
  "SV Temple, Rishikesh",
  "SV Temple, Rushikonda, Visakhapatnam",
  "SV Temple, Bhubaneswar, Odisha state",
  "SV Temple, Amaravathi, Andhra Pradesh",
  "Sri Vakulamatha Temple, Patakalva, Tirupati Rural",
  "Sri Padmavathi Ammavari Temple, Chennai",
  "SV Temple, Seethampeta, Parvathi puram Manyam",
  "SV Temple, Rampachodavaram, ASR Dist",
  "SV Temple, Jammu, Jammu & Kashmir",
  "Sri Padmavathi Ammavari Temple, Tiruchanoor",
  "Sri Govindaraja Swamy Temple, Tirupati",
  "Sri Kalyana Venkateswara Swamy Temple, Srinivasa Mangapuram",
  "Sri Kapilatheertham Temple, Tirupati",
  "Sri Kodanda Ramaswamy Temple, Tirupati",
  "Sri Kalyana Venkateswara Swamy Temple, Narayanavanam",
  "Sri Veda Narayana Swamy Temple, Nagalapuram",
  "SV Temple, TTD K.M. premises, Vijayawada",
  "Sri Prasanna Venkateswara Swamy Temple, Appalayagunta",
  "Sri Seeta Rama Swamy Temple, Saripalli",
  "Sri Chennakesava Swamy and Siddeswaraswamy Temple, Thallapaka",
  "Sri Kariya Manikya Swamy Temple, Nagiri",
  "Sri Annapoorna Sametha Kaasi Visweswara Swamy Temple, Bugga",
  "Sri Pattabhi Rama Swamy Temple, Valmikipuram",
  "Sri Venu Gopala Swamy Temple, Karvetinagaram",
  "SV Temple, Pitapuram",
  "Sri Lakshmi Venkateswara Swamy Temple, Devunigadapa",
  "SV Temple, Tondamanadu",
  "Sri Lakshmi Narasimha Swamy Temple, Tarigonda",
  "Sri Narapura Venkateswara Swamy Vari Temple, Jammalamadugu",
  "Sri Kari Varada Raja Swamy Temple, Satravada",
  "Sri Srinivasa Temple, Tiruchanoor",
  "Sri Prasanna Venkateswara Swamy Temple, Kosuvaripalli",
  "Sri Konetiraya Swamy Temple, Keelapatla",
  "Sri Kodanda Rama Swamy Devasthanam, Vontimitta",
  "Sri Kodandaramaswamy Devasthanam, Chandragiri",
  "SV Temple, Ananthavaram",
  "Sri Venkateswaraswamy Temple, Upamaka",
  "Sri Alaghu Mallari Krishnaswamy Temple, Mannarpolur",
  "SKMS &SNKS Temples, Thummuru, SPS Nellore Dist",
  "SV Temple, Nimmakuru, Pamaru, Krishna District",
  "Sri Seshachala Lingeswara Swamy Temple, Kandulavaripalli",
  "Sri Prasanna Venkateswara Swamy Temple, Booragamanda, Sadum",
  "Sri Kalyana Venkataramana Swamy Temple, Punganur",
  "SV Temple, KaligiriKonda, Chittoor District",
  "Sri Varada Venkateswara Swamy Temple, Allathuru, Chittoor dt.",
  "Sri Prasanna Venkateswara Swamy Temple, Mangalampeta",
  "Sri Prasanna Venkateswara Swamy Temple, Avulapalli, Somala.",
  "Sri Sowmyanatha Swamy Temple, Nandalur",
  "Sri Balaji Temple, Antakapalli",
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const ID_PROOFS = ["Aadhaar Card", "Passport"];
export const MARITAL_STATUSES = ["Single", "Married"];

export const QUALIFICATION_CATEGORIES = [
  "Undergraduate (Bachelor's Degrees)",
  "Postgraduate (Master's Degrees)",
  "M.Phil / Pre-Doctoral",
  "Doctorate (PhD / DSc / DLitt / MD etc.)",
  "Post-Doctoral",
];

export const QUALIFICATIONS_BY_CATEGORY = {
  "Undergraduate (Bachelor's Degrees)": [
    "B.A. (Bachelor of Arts)", "B.Sc. (Bachelor of Science)", "B.Com. (Bachelor of Commerce)",
    "B.B.A. (Bachelor of Business Administration)", "B.C.A. (Bachelor of Computer Applications)",
    "B.Tech / B.E. (Bachelor of Technology / Engineering)", "B.Arch. (Bachelor of Architecture)",
    "B.Pharm. (Bachelor of Pharmacy)", "B.Ed. (Bachelor of Education)", "LLB (Bachelor of Law)",
    "MBBS (Bachelor of Medicine, Bachelor of Surgery)", "BDS (Bachelor of Dental Surgery)",
    "B.V.Sc (Veterinary Science)", "BAMS (Ayurvedic Medicine and Surgery)", "Other Bachelor's",
  ],
  "Postgraduate (Master's Degrees)": [
    "M.A. (Master of Arts)", "M.Sc. (Master of Science)", "M.Com. (Master of Commerce)",
    "M.B.A. (Master of Business Administration)", "M.C.A. (Master of Computer Applications)",
    "M.Tech / M.E. (Master of Technology / Engineering)", "M.Arch. (Master of Architecture)",
    "M.Pharm. (Master of Pharmacy)", "M.Ed. (Master of Education)", "LLM (Master of Law)",
    "MD (Doctor of Medicine)", "MS (Master of Surgery)", "MDS (Dental Surgery)",
    "M.V.Sc (Veterinary Science)", "Other Master's",
  ],
  "M.Phil / Pre-Doctoral": ["Science and Engineering", "Social Science", "Humanities", "Business and Management", "Health and Medicine", "Education", "Law", "Others"],
  "Doctorate (PhD / DSc / DLitt / MD etc.)": ["Science and Engineering", "Social Science", "Humanities", "Business and Management", "Health and Medicine", "Education", "Law", "Others"],
  "Post-Doctoral": ["Post-Doctoral Fellowship", "Research Fellowship"],
};

export const EMPLOYMENT_STATUSES = [
  "In-Service", "Retired", "Self-Employed / Entrepreneur / Business", "Freelancer / Consultant",
  "Home Maker", "Unemployed", "Student", "Others",
];

export const EMPLOYMENT_SECTORS = [
  "Government – Central", "Government – State", "Government – Local Bodies", "Judiciary",
  "Defence / Armed Forces", "Public Sector Undertaking (PSU)", "Statutory Bodies",
  "Private Sector / Corporate", "Multinational Company (MNC)", "Non-Governmental Organization (NGO)",
  "Academic / Research Institution", "Freelancer / Consultant", "Self-Employed / Entrepreneur / Business", "Others",
];

export const PROFESSIONAL_CATEGORIES = [
  "Creative, Art, Media & Communication", "Education & Training", "Engineering & Manufacturing",
  "Finance & Accounting", "Government / Public Administration", "Information Technology (IT) & Software",
  "Management", "Sales & Marketing", "Healthcare & Medical", "Judiciary & Legal Services",
  "Self-Employed / Entrepreneur", "Skilled Trades", "Research & Development", "Hospitality & Tourism",
  "Sports & Physical Education", "Non-Profit & Social Sector", "Defence Services",
];

export const PROFESSIONS_BY_CATEGORY = {
  "Creative, Art, Media & Communication": ["Artist", "Musician", "Graphic Designer", "Video Editor", "Photographer", "Copywriter", "Content Creator", "Animator", "Art Director", "Journalist / Reporter", "Public Relations Executive"],
  "Education & Training": ["Teacher / Lecturer", "Assistant Professor / Professor", "Research Scholar", "Academic Coordinator", "Curriculum Developer", "Principal / Headmaster", "Education Consultant", "Librarian", "Corporate Trainer", "Skill Developer", "Motivational Speaker"],
  "Engineering & Manufacturing": ["Mechanical Engineer", "Civil Engineer", "Electrical / Electronics Engineer", "Production Supervisor", "Quality Control Engineer", "Maintenance Engineer", "Plant Manager", "CAD Designer", "Safety Officer", "Architect / Planner"],
  "Finance & Accounting": ["Accountant", "Manager", "Chartered Accountant (CA)", "Financial Analyst", "Auditor", "Tax Consultant", "Accounts Executive", "Investment Analyst", "Finance Manager", "Payroll Officer", "Banking Officer"],
  "Government / Public Administration": ["Clerk / Assistant", "Section Officer", "Administrative Officer", "Police", "Fire", "Excise", "Transport", "Engineer (All Cadres)", "All India Service / Central Service Officer", "Revenue Officer", "Forest Officer", "Others"],
  "Information Technology (IT) & Software": ["Software Developer / Engineer", "Frontend / Backend Developer", "Full Stack Developer", "Data Analyst / Data Scientist", "UI/UX Designer", "IT Support Specialist", "Network Engineer", "Systems Administrator", "Cloud Engineer", "DevOps Engineer", "AI/ML Engineer", "Cybersecurity Analyst", "IT Project Manager", "QA Tester / Automation Engineer"],
  Management: ["Project Manager", "Operations Manager", "Business Analyst", "HR Manager / Executive", "Office Administrator", "Executive Assistant", "Program Coordinator", "Procurement Manager", "Strategy Consultant", "Business Development Manager", "Marketing Manager / Executive", "General Manager", "Fiscal Manager / Expert"],
  "Sales & Marketing": ["Sales Executive / Manager", "Marketing Executive / Manager", "Digital Marketing Specialist", "Social Media Manager", "SEO / SEM Specialist", "Content Marketer", "Brand Manager", "Product Manager", "Customer Relationship Manager (CRM)", "Business Development Executive"],
  "Healthcare & Medical": ["Doctor / General Practitioner", "Surgeon", "Nurse", "Pharmacist", "Lab Technician", "Radiologist", "Physiotherapist", "Medical Officer", "Dentist", "Health Inspector", "Biotechnician", "Therapist"],
  "Judiciary & Legal Services": ["Judge", "Advocate", "Legal Advisor", "Compliance Officer", "Officers of the Court"],
  "Self-Employed / Entrepreneur": ["Business Owner / Entrepreneur", "Freelancer (e.g., Writer, Developer)", "Consultant", "Trader", "Contractor", "Artisan / Craftsman", "Farmer"],
  "Skilled Trades": ["Electrician", "Carpenter", "Technician", "Driver", "Craftsmen", "Plumber", "Mason", "Fitter", "Mechanic", "Chef (Cook)"],
  "Research & Development": ["Scientist", "Researcher", "Analyst"],
  "Hospitality & Tourism": ["Hotelier", "Travel Consultant / Guide", "Event Manager"],
  "Sports & Physical Education": ["Athlete", "Coach", "Yoga Instructor", "Physical Trainer"],
  "Non-Profit & Social Sector": ["NGO Social Worker", "Community Developer"],
  "Defence Services": ["Army (All Cadres)", "Navy (All Cadres)", "Air Force (All Cadres)"],
};

export const LANGUAGES = ["Telugu", "English", "Hindi", "Tamil", "Kannada", "Malayalam", "Bengali", "Gujarati", "Konkani", "Marathi", "Nepali", "Odia", "Punjabi"];

export const TRAINER_EXPERTISE_AREAS = [
  "Devotional Discipline & Code of Conduct", "Queue & Pilgrim Management", "Temple Etiquette",
  "Srivari Seva Procedures", "Hospitality Communication & Soft Skills", "Safety Security & First Aid",
  "Others (Specify)",
];

export const COUNTRIES = [
  "India", "Afghanistan", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", "Anguilla",
  "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize",
  "Benin", "Bermuda", "Bhutan", "Bolivia", "Bosnia", "Botswana", "Bouvet Island", "Brazil",
  "British Indian Ocean Territory", "Brunei", "Bulgaria", "Burkina Faso", "Burma", "Burundi",
  "Cambodia", "Cameroon", "Canada", "Canton and Enderbury Islands", "Cape Verde", "Cayman Islands",
  "Central African Republic", "Chad", "Chile", "China", "Christmas Island", "Cocos(Keeling) Islands",
  "Colombia", "Comoros", "Congo", "Cook Islands", "Costa Rica", "Cote DIvoire", "Croatia(Hrvatska)",
  "Cuba", "Cyprus", "Czech Republic", "Democratic Yemen", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Dronning Maud Land", "East Timor", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Falkland Islands(Malvinas)", "Faroe Islands",
  "Fiji", "Finland", "France", "France Metropolitan", "French Guiana", "French Polynesia",
  "French Southern Territories", "Gabon", "Gambia", "Gaudeloupe", "Georgia", "Germany", "Ghana",
  "Gibraltar", "Greece", "Greenland", "Grenada", "Guam", "Guatemala", "Guernsey", "Guinea",
  "Guinea-bisseu", "Guyana", "Haiti", "Heard and Mc Donald Islands", "Honduras", "Hong Kong",
  "Hungary", "Iceland", "Indonesia", "Iran(Islamic Republic", "Iraq", "Ireland", "Isle of Man",
  "Israrl", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jersey", "Johnston Island", "Jordan",
  "kazakhstan", "Kenya", "Kiribati", "Korea,Democratic Peoples Republic of", "Korea,Republic of",
  "Kuwait", "Kyrgyzstan", "Lao Peoples Democratic Republic", "Latvia", "Lebanon", "Lesotho",
  "Liberia", "Libyan Arab Jamahiriya", "Liechtenstein", "Lithuania", "Luxembourg", "Macau",
  "Macedonia", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands",
  "Martinique", "Mauritania", "Mauritius", "Mayotte", "Mexico", "Micronesia,Federated States of",
  "Midway Islands", "Moldova,Republic of", "Monaco", "Mongolia", "Montenegro", "Montserrat",
  "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands",
  "Netherlands Antilles", "Neutral Zone", "New Calidonia", "New Zealand", "Nicaragua", "Niger",
  "Nigeria", "Niue", "Norfolk Island", "North Korea", "Northern Mariana Islands", "Norway", "Oman",
  "Pacific Islands", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Peru",
  "Philippines", "Pitcairn Island", "Poland", "Portugal", "Praguay", "Puerto Rico", "Qatar",
  "Reunion", "Romania", "Russian Federation", "Rwanda", "S.Georgia and S.Sandwich Islands",
  "Saint Lucia", "Saint Vincent/Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Sint Maarten",
  "Slovakia(Slovak Republic", "Slovenia", "Solomon Islands", "Somalia", "South Africa",
  "South Georgia and South Sandwich Islands", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "St. Barthélemy", "St. Helena", "St. Kitts Nevis Anguilla", "St. Lucia", "St. Martin",
  "St. Pierre and Miquelon", "St. Vincent and Grenadines", "Sudan", "Suriname",
  "Svalbard and Jan Mayen Islands", "Swaziland", "Sweden", "Switzerland", "Syran Arab Republic",
  "Taiwan", "Tajikistan", "Tanzania,United Republic of", "Thailand", "Timor-Leste", "Togo",
  "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan",
  "Turks and Caicos Islands", "Tuvalu", "US Minor Outlying Islands", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "United States Pacific Islands",
  "Upper Volta", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City State", "Venezuela", "Vietnam",
  "Virgin Islands, British", "Virgin Islands, United States", "Wake Island",
  "Wallis and Futuma Islands", "Western Sahara", "Yemen", "Yugoslavia", "Zaire", "Zambia",
  "Zimbabwe", "Aland Islands", "Caribbean Netherlands", "Congo - Brazzaville", "Congo - Kinshasa", "Curaçao",
];

export const STATES = [
  "Andaman & Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra & Nagar Haveli", "Daman & Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Orissa",
  "Pondicherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttaranchal", "West Bengal",
];

export const DISTRICTS_BY_STATE = {
  "Andaman & Nicobar": ["Andaman", "Nicobar"],
  "Andhra Pradesh": ["Anantapur", "Guntur", "Chittoor", "Kurnool", "Visakhapatnam", "Anakapalle", "Eluru", "Bapatla", "Kakinada", "Nandyal", "Parvatipuram", "Tirupati", "Alluri Sitharama Raju", "Annamayya", "Dr.B.R.Ambedkar Konaseema", "East Godavari", "Krishna", "NTR", "Palnadu", "prakasam", "Sri potti sriramulu nellore", "Sri Satya sai", "West Godavari", "YSR", "Srikakulam", "Vizianagaram"],
  "Arunachal Pradesh": ["Changlang", "East Kameng", "Kurung Kumey", "Lower Dibang Valley", "Papum Pare", "Upper Siang", "West Kameng", "Anjaw", "Dibang Valley", "East Siang", "Lohit", "Lower Subansiri", "Tawang", "Tirap", "Upper Subansiri", "West Siang"],
  Assam: ["Bongaigaon", "Darrang", "Dhubri", "Goalpara", "Hailakandi", "Kamrup", "Karimganj", "Lakhimpur", "Nagaon", "North Cachar Hills", "Sonitpur", "Barpeta", "Cachar", "Dhemaji", "Dibrugarh", "Golaghat", "Jorhat", "Karbi Anglong", "Kokrajhar", "Marigaon", "Nalbari", "Sivasagar", "Tinsukia"],
  Bihar: ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"],
  Telangana: ["Bhadradri Kothagudem", "Jagtial", "Jangaon", "Jayashankar Bhupalapally", "Jogulamba Gadwal", "Kamareddy", "Kumarambheem Asifabad", "Mahabubabad", "Mancherial", "Medchal–Malkajgiri", "Nagarkurnool", "Nirmal", "Peddapalli", "Rajanna Sircilla", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal Urban", "Yadadri Bhuvanagiri", "Mulugu", "Narayanpet", "Warangal Rural", "Medak", "Hyderabad", "Khammam", "Karimnagar", "Mahabubnagar", "Nalgonda", "Nizamabad", "RangaReddy", "Adilabad"],
  "Tamil Nadu": ["Chennai", "Cuddalore", "Dindigul", "Kanchipuram", "Karur", "Madurai", "Namakkal", "Pudukkottai", "Salem", "Thanjavur", "Theni", "Tiruchirapalli", "Tiruvallur", "Tiruvarur", "Viluppuram", "Krishnagiri", "Nagapattinam", "Perambalur", "Ramanathapuram", "Sivaganga", "The Nilgiris", "Thoothukudi", "Tirunelveli", "Tiruvannamalai", "Vellore", "Virudhunagar", "Coimbatore", "Dharmapuri", "Erode", "Kanyakumari", "Tirupur"],
  Karnataka: ["Bagalkot", "Bangalore Rural", "Bellary", "Bijapur", "Chickmagalur", "Davangere", "Gadag", "Hassan", "Kodagu", "Koppal", "Mysore", "Raichur", "South Kannada", "Udupi", "Bangalore", "Belgaum", "Bidar", "Chamrajnagar", "Chitradurga", "Dharwad", "Gulbarga", "Haveri", "Kolar", "Mandya", "North Kannada", "Shimoga", "Tumkur", "Chikballapur"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Bilaspur", "Dhamtari", "Janjgir-Champa", "Kanker", "Korba", "Mahasamund", "Raipur", "Surguja", "Bastar", "Dantewada", "Durg", "Jashpur", "Kawardha", "Korea", "Raigarh", "Rajnandgaon"],
  "Dadra & Nagar Haveli": ["Dadra & Nagar Haveli"],
  "Daman & Diu": ["Daman", "Diu"],
  Delhi: ["Central Delhi", "New Delhi", "North East Delhi", "South Delhi", "West Delhi", "East Delhi", "North Delhi", "North West Delhi", "South West Delhi"],
  Goa: ["North Goa", "South Goa"],
  Gujarat: ["Amreli", "Banas Kantha", "Bhavnagar", "Gandhinagar", "Junagadh", "Kheda", "Narmada", "Panch Mahals", "Porbandar", "Sabar Kantha", "Surendranagar", "Vadodara", "The Dangs", "Valsad", "Ahmedabad", "Anand", "Bharuch", "Dahod", "Jamnagar", "Kachchh", "Mahesana", "Navsari", "Patan", "Rajkot", "Surat"],
  Haryana: ["Bhiwani", "Fatehabad", "Hisar", "Jind", "Karnal", "Mahendragarh", "Panchkula", "Rewari", "Sirsa", "Yamunanagar", "Ambala", "Faridabad", "Gurgaon", "Jhajjar", "Kaithal", "Kurukshetra", "Mewat", "Panipat", "Rohtak", "Sonipat"],
  "Himachal Pradesh": ["Bilaspur", "Hamirpur", "Kinnaur", "Lahaul & Spiti", "Shimla", "Solan", "Chamba", "Kangra", "Kullu", "Mandi", "Sirmaur", "Una"],
  "Jammu & Kashmir": ["Baramulla", "Doda", "Kargil", "Kupwara", "Poonch", "Rajauri", "Udhampur", "Anantnag", "Budgam", "Jammu", "Kathua", "Leh", "Pulwama", "Srinagar"],
  Jharkhand: ["Chatra", "Dhanbad", "East Singhbhum", "Giridih", "Gumla", "Jamtara", "Latehar", "Pakur", "Ranchi", "Seraikela", "West Singhbhum", "Bokaro", "Deoghar", "Dumka", "Garhwa", "Godda", "Hazaribag", "Koderma", "Lohardaga", "Palamu", "Sahibganj", "Simdega"],
  Kerala: ["Alappuzha", "Idukki", "Kasargod", "Kottayam", "Malappuram", "Pathanamthitta", "Thrissur", "Ernakulam", "Kannur", "Kollam", "Kozhikode", "Palakkad", "Thiruvananthapuram", "Wayanad"],
  Lakshadweep: ["Lakshadweep"],
  "Madhya Pradesh": ["Ashoknagar", "Barwani", "Bhind", "Burhanpur", "Chhindwara", "Datia", "Dhar", "Guna", "Harda", "Indore", "Jhabua", "Khandwa", "Mandla", "Morena", "Neemuch", "Raisen", "Ratlam", "Sagar", "Sehore", "Shahdol", "Sheopur", "Sidhi", "Ujjain", "Vidisha", "Anuppur", "Balaghat", "Betul", "Bhopal", "Chhatarpur", "Damoh", "Dewas", "Dindori", "Gwalior", "Hoshangabad", "Jabalpur", "Katni", "Khargone", "Mandsaur", "Narsinghpur", "Panna", "Rajgarh", "Rewa", "Satna", "Seoni", "Shajapur", "Shivpuri", "Tikamgarh", "Umaria"],
  Maharashtra: ["Ahmednagar", "Amravati", "Beed", "Buldhana", "Dhule", "Gondia", "Jalgaon", "Kolhapur", "Mumbai City", "Nagpur", "Nandurbar", "Osmanabad", "Pune", "Ratnagiri", "Satara", "Solapur", "Wardha", "Yavatmal", "Akola", "Aurangabad", "Bhandara", "Chandrapur", "Gadchiroli", "Hingoli", "Jalna", "Latur", "Mumbai Suburban", "Nanded", "Nashik", "Parbhani", "Raigad", "Sangli", "Sindhudurg", "Thane", "Washim"],
  Manipur: ["Bishnupur", "Churachandpur", "East Imphal", "Tamenglong", "Ukhrul", "Chandel", "Imphal", "West Senapati", "Thoubal"],
  Meghalaya: ["East Garo Hills", "Jaintia Hills", "South Garo Hills", "West Khasi Hills", "East Khasi Hills", "Ri Bhoi", "West Garo Hills"],
  Mizoram: ["Aizawl", "Kolasib", "Lunglei", "Saiha", "Champhai", "Lawngtlai", "Mamit", "Serchhip"],
  Nagaland: ["Kohima", "Mon", "Tuensang", "Zunheboto", "Dimapur", "Mokokchung", "Phek", "Wokha"],
  Orissa: ["Angul", "Baleswar", "Bhadrak", "Cuttack", "Dhenkanal", "Ganjam", "Jajpur", "Kalahandi", "Kendrapara", "Khordha", "Malkangiri", "Nabarangapur", "Nuapada", "Rayagada", "Subarnapur", "Bargarh", "Boudh", "Deogarh", "Gajapati", "Jagatsinghapur", "Jharsuguda", "Kandhamal", "Kendujhar", "Koraput", "Mayurbhanj", "Nayagarh", "Puri", "Sambalpur", "Sundergarh", "Balangir"],
  Pondicherry: ["Mahe", "Yanam", "Karaikal", "Pondicherry"],
  Punjab: ["Amritsar", "Faridkot", "Sahib", "Gurdaspur", "Bathinda", "Fatehgarh", "Ferozepur", "Hoshiarpur", "Kapurthala", "Mansa", "Muktsar", "Patiala", "Sangrur", "Jalandhar", "Ludhiana", "Moga", "Nawanshahr", "Rupnagar"],
  Rajasthan: ["Ajmer", "Banswara", "Barmer", "Bhilwara", "Bundi", "Churu", "Dholpur", "Hanumangarh", "Jaisalmer", "Jhalawar", "Jodhpur", "Kota", "Pali", "Sawai Madhopur", "Sirohi", "Tonk", "Alwar", "Baran", "Bharatpur", "Bikaner", "Chittorgarh", "Dausa", "Dungarpur", "Jaipur", "Jalore", "Jhunjhunu", "Karauli", "Nagaur", "Rajsamand", "Sikar", "Sri Ganganagar", "Udaipur"],
  Sikkim: ["North Sikkim", "West Sikkim", "East Sikkim", "South Sikkim"],
  Tripura: ["North Tripura", "West Tripura", "Dhalai", "South Tripura"],
  "Uttar Pradesh": ["Agra", "Allahabad", "Auraiya", "Bagpat", "Ballia", "Banda", "Bareilly", "Bijnor", "Bulandshahr", "Chitrakoot", "Etah", "Faizabad", "Aligarh", "Ambedkar Nagar", "Azamgarh", "Bahraich", "Balrampur", "Barabanki", "Basti", "Budaun", "Chandauli", "Deoria", "Etawah", "Farrukhabad", "Firozabad", "Ghaziabad", "Gonda", "Hamirpur", "Hathras", "Jaunpur", "Jyotiba Phule Nagar", "Kanpur Dehat", "Kaushambi", "Kushinagar", "Lucknow", "Mahoba", "Mathura", "Meerut", "Moradabad", "Pilibhit", "RaeBareli", "Saharanpur", "Sant Ravidas Nagar", "Shravasti", "Sitapur", "Sultanpur", "Varanasi", "Maharajganj", "Mainpuri", "Mau", "Mirzapur", "Muzaffarnagar", "Fatehpur", "Gautam Buddha Nagar", "Pratapgarh", "Rampur", "Sant Kabir Nagar", "Shahjahanpur", "Siddharthnagar", "Sonbhadra", "Unnao", "Ghazipur", "Gorakhpur", "Hardoi", "Jalaun", "Jhansi", "Kannauj", "Kanpur Nagar", "Kheri", "Lalitpur"],
  Uttaranchal: ["Almora", "Chamoli", "Dehradun", "Nainital", "Pithoragarh", "Tehri Garhwal", "Uttarkashi", "Rudraprayag", "Udham Singh Nagar", "Bageshwar", "Champawat", "Haridwar", "Pauri Garhwal"],
  "West Bengal": ["Bankura", "Birbhum", "Darjeeling", "Hooghly", "Jalpaiguri", "Murshidabad", "North 24 Parganas", "Purulia", "South Dinajpur", "Kharagpur", "Bardhaman", "Cooch Behar", "East Medinipur", "Howrah", "Malda", "Nadia", "North Dinajpur", "South 24 Parganas", "West Medinipur"],
};

export const DEFAULT_SEVAK = {
  idType: "Aadhaar Card", idNumber: "", dob: "", age: "", gender: "Male", mobileNo: "", email: "",
  pincode: "", country: "India", state: "", district: "", city: "", sevakName: "", surName: "",
  fatherOrSpouseName: "", bloodGroup: "", mentallyFit: false, physicallyFit: false,
  volunteerQualification: "", volunteerProfession: "", employeeId: "", designation: "",
  specialisation: "", placeOfWork: "", street: "", doorNo: "", nearestTtdTemple: "",
  spvrName: "", spvrRelativeName: "", maritalStatus: "", altMobileNo: "", residentialAdrs: "",
  qualification: "", specQualification: "", uniName: "", yearOfGraduation: "", eduSpecialization: "",
  employmentStatus: "", employmentSector: "", professionalCategory: "", specProfession: "",
  profYearsOfExp: "", previouslyVolunteered: "", noOfParticipation: "", lastTwoSevaPeriods: "",
  religiousInstitute: "", volunteeredExp: "", firstRefName: "", firstRefDetails: "",
  firstRefMobileNo: "", secRefName: "", secRefDetails: "", secRefMobileNo: "", languages: [],
  experiencedTrainer: "", trainerInstituteName: "", trainerRole: "", trainerExp: "",
  areaOfTrainerExp: [], otherAreaOfTrainerExp: "", preferredLoc: "", otherPreferredLoc: "",
  timeCommitment: "", freq: "", photo: null, document: null, eduCertificate: null,
};

export function getDistricts(state) {
  return DISTRICTS_BY_STATE[state] || [];
}
