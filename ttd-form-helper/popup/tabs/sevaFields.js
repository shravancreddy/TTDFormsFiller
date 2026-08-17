// Shared Srivari Seva field set — used by both the individual Seva tab and
// each member of the Seva (Group) tab. Field *names* below are the exact
// contract the content script (content/autofill.js -> fillSevaForm) reads,
// so don't rename them without updating the content script too.
import { t } from "../../shared/i18n.js";
import {
  TTD_TEMPLES, BLOOD_GROUPS, ID_PROOFS, MARITAL_STATUSES, QUALIFICATION_CATEGORIES,
  QUALIFICATIONS_BY_CATEGORY, EMPLOYMENT_STATUSES, EMPLOYMENT_SECTORS, PROFESSIONAL_CATEGORIES,
  PROFESSIONS_BY_CATEGORY, LANGUAGES, TRAINER_EXPERTISE_AREAS, COUNTRIES, STATES, getDistricts,
} from "../../shared/formData.js";

const MAX_FILE_BYTES = 1 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png"];

function opt(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label ?? value;
  return o;
}

function fillSelect(select, options, placeholder) {
  select.innerHTML = "";
  if (placeholder !== undefined) select.appendChild(opt("", placeholder));
  for (const o of options) select.appendChild(opt(o, o));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function computeAgeFromDob(dobText) {
  const parts = dobText.split("/");
  if (parts.length !== 3) return null;
  const dob = new Date(parts[2], parts[1] - 1, parts[0]);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age > 0 && age < 150 ? age.toString() : null;
}

function fileRow(labelKey, dataKey, data, onNotify, showMessage, accept = ".jpeg,.jpg,.png") {
  const group = document.createElement("div");
  group.className = "form-group";
  const label = document.createElement("label");
  label.textContent = t(labelKey);
  group.appendChild(label);

  const body = document.createElement("div");
  group.appendChild(body);
  const hint = document.createElement("small");
  hint.className = "field-hint";
  hint.textContent = t("hint_max_1mb");
  group.appendChild(hint);

  function renderBody() {
    body.innerHTML = "";
    if (data[dataKey]) {
      const uploaded = document.createElement("div");
      uploaded.className = "file-uploaded";
      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = "📄 " + data[dataKey].name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-remove-file";
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        data[dataKey] = null;
        onNotify();
        renderBody();
      });
      uploaded.appendChild(name);
      uploaded.appendChild(remove);
      body.appendChild(uploaded);
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
          showMessage(t("msg_invalid_format", { extensions: accept }));
          e.target.value = "";
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          showMessage(t("msg_file_too_large"));
          e.target.value = "";
          return;
        }
        const dataUrl = await fileToDataUrl(file);
        data[dataKey] = { data: dataUrl, name: file.name, type: file.type, size: file.size };
        onNotify();
        showMessage(t("msg_file_uploaded", { name: file.name }));
        renderBody();
      });
      body.appendChild(input);
    }
  }
  renderBody();
  return group;
}

export function buildSevaFieldsForm({ data, onNotify, showMessage, isGroup = false, isLeader = false }) {
  const root = document.createElement("div");
  root.className = "section-content";

  const group = (labelKey, inputEl) => {
    const g = document.createElement("div");
    g.className = "form-group";
    const label = document.createElement("label");
    label.textContent = t(labelKey);
    g.appendChild(label);
    g.appendChild(inputEl);
    return g;
  };
  const row = (...groups) => {
    const r = document.createElement("div");
    r.className = "form-row";
    groups.forEach((g) => r.appendChild(g));
    return r;
  };
  const heading = (labelKey) => {
    const h = document.createElement("h4");
    h.className = "section-heading";
    h.textContent = t(labelKey);
    return h;
  };
  const textInput = (name, opts = {}) => {
    const input = document.createElement("input");
    input.type = opts.type || "text";
    input.name = name;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.required) input.required = true;
    if (opts.maxLength) input.maxLength = opts.maxLength;
    if (opts.pattern) input.pattern = opts.pattern;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    input.value = data[name] ?? "";
    input.addEventListener("input", () => {
      data[name] = input.value;
      onNotify();
    });
    return input;
  };
  const selectInput = (name, options, opts = {}) => {
    const select = document.createElement("select");
    select.name = name;
    if (opts.required) select.required = true;
    if (opts.disabled) select.disabled = true;
    fillSelect(select, options, opts.placeholder ?? t("select_placeholder"));
    select.value = data[name] ?? "";
    select.addEventListener("change", () => {
      data[name] = select.value;
      onNotify();
      opts.onChange && opts.onChange(select.value);
    });
    return select;
  };
  const radioGroup = (name, choices) => {
    const wrap = document.createElement("div");
    wrap.className = "radio-group";
    choices.forEach(([value, labelKey]) => {
      const label = document.createElement("label");
      label.className = "radio-label";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      input.checked = data[name] === value;
      input.addEventListener("change", () => {
        data[name] = value;
        onNotify();
        syncConditionals();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(t(labelKey)));
      wrap.appendChild(label);
    });
    return wrap;
  };
  const checkboxInline = (name, labelKey) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!data[name];
    input.addEventListener("change", () => {
      data[name] = input.checked;
      onNotify();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(t(labelKey)));
    return label;
  };
  const checkboxGrid = (name, allValues, onToggle) => {
    const wrap = document.createElement("div");
    wrap.className = "checkbox-grid";
    wrap.style.maxHeight = "120px";
    wrap.style.overflowY = "auto";
    allValues.forEach((val) => {
      const label = document.createElement("label");
      label.className = "checkbox-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = (data[name] || []).includes(val);
      input.addEventListener("change", () => {
        const current = data[name] || [];
        data[name] = input.checked ? [...current, val] : current.filter((v) => v !== val);
        onNotify();
        onToggle && onToggle();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(val));
      wrap.appendChild(label);
    });
    return wrap;
  };

  // ---- Section 1: identification + address (always shown) ----
  const idTypeSelect = selectInput("idType", ID_PROOFS, { required: true, placeholder: undefined });
  root.appendChild(group("field_id_proof_type", idTypeSelect));

  const idNumberInput = textInput("idNumber", { required: true, maxLength: 12, placeholder: data.idType === "Aadhaar Card" ? t("placeholder_aadhaar_12") : t("placeholder_passport_number") });
  root.appendChild(group("field_id_proof_number", idNumberInput));
  idTypeSelect.addEventListener("change", () => {
    idNumberInput.placeholder = data.idType === "Aadhaar Card" ? t("placeholder_aadhaar_12") : t("placeholder_passport_number");
  });

  root.appendChild(row(
    group("field_name", textInput("sevakName", { required: true })),
    group("field_surname", textInput("surName"))
  ));
  root.appendChild(group("field_father_spouse", textInput("fatherOrSpouseName", { required: true })));

  const dobInput = textInput("dob", { placeholder: t("field_date_placeholder"), required: true });
  const ageInput = textInput("age", { type: "number", min: 18, max: 100, required: true });
  dobInput.addEventListener("input", () => {
    const computed = computeAgeFromDob(dobInput.value);
    if (computed) {
      ageInput.value = computed;
      data.age = computed;
    }
  });
  root.appendChild(row(group("field_dob", dobInput), group("field_age", ageInput)));

  root.appendChild(row(
    group("field_mobile", textInput("mobileNo", { maxLength: 10, pattern: "[0-9]{10}", placeholder: t("placeholder_10_digit"), required: true })),
    group("field_email_id", textInput("email", { type: "email", required: true }))
  ));

  root.appendChild(row(
    group("field_blood_group", selectInput("bloodGroup", BLOOD_GROUPS)),
    (() => {
      const g = document.createElement("div");
      g.className = "form-group";
      g.innerHTML = `<label>${t("field_gender")}</label>`;
      g.appendChild(radioGroup("gender", [["Male", "gender_male"], ["Female", "gender_female"]]));
      return g;
    })()
  ));

  const fitnessGroup = document.createElement("div");
  fitnessGroup.className = "form-group";
  fitnessGroup.innerHTML = `<label>${t("field_fitness")}</label>`;
  const fitnessWrap = document.createElement("div");
  fitnessWrap.className = "checkbox-group-inline";
  fitnessWrap.appendChild(checkboxInline("mentallyFit", "field_mentally_fit"));
  fitnessWrap.appendChild(checkboxInline("physicallyFit", "field_physically_fit"));
  fitnessGroup.appendChild(fitnessWrap);
  root.appendChild(fitnessGroup);

  root.appendChild(row(
    group("field_street", textInput("street", { required: true })),
    group("field_door_no", textInput("doorNo", { required: true }))
  ));
  root.appendChild(row(
    group("field_pincode", textInput("pincode", { maxLength: 6, pattern: "[0-9]{6}", required: true })),
    group("field_country_required", selectInput("country", COUNTRIES, { required: true, placeholder: undefined }))
  ));

  const districtSelect = document.createElement("select");
  districtSelect.name = "district";
  const districtGroupWrap = document.createElement("div");
  const rebuildDistrict = () => {
    districtGroupWrap.innerHTML = "";
    const label = document.createElement("label");
    label.textContent = t("field_district_required");
    districtGroupWrap.appendChild(label);
    const districts = getDistricts(data.state);
    if (districts.length > 0) {
      fillSelect(districtSelect, districts, t("select_district"));
      districtSelect.required = true;
      districtSelect.value = data.district ?? "";
      districtSelect.onchange = () => {
        data.district = districtSelect.value;
        onNotify();
      };
      districtGroupWrap.appendChild(districtSelect);
    } else {
      const input = textInput("district", { placeholder: t("placeholder_enter_district"), required: true });
      districtGroupWrap.appendChild(input);
    }
  };
  rebuildDistrict();
  districtGroupWrap.className = "form-group";

  const stateSelect = selectInput("state", STATES, {
    required: true,
    placeholder: t("select_state"),
    onChange: () => {
      data.district = "";
      rebuildDistrict();
    },
  });
  root.appendChild(row(group("field_state_required", stateSelect), districtGroupWrap));

  root.appendChild(group("field_city_required", textInput("city", { required: true })));

  const templeSelect = selectInput("nearestTtdTemple", TTD_TEMPLES, { placeholder: t("select_temple"), disabled: isGroup && !isLeader });
  const templeGroup = group("field_nearest_temple", templeSelect);
  if (isGroup && !isLeader && data.nearestTtdTemple) {
    const hint = document.createElement("small");
    hint.className = "field-hint";
    hint.textContent = t("field_synced_leader");
    templeGroup.appendChild(hint);
  }
  root.appendChild(templeGroup);

  root.appendChild(fileRow("field_photo", "photo", data, onNotify, showMessage, ".jpeg,.jpg,.png"));

  if (isGroup) return root;

  // ---- Section 2: volunteer basics ----
  root.appendChild(heading("volunteer_details_heading"));
  root.appendChild(row(
    group("field_qualification", textInput("volunteerQualification", { placeholder: t("placeholder_e_g_bt"), required: true })),
    group("field_profession", textInput("volunteerProfession", { placeholder: t("placeholder_e_g_engineer"), required: true }))
  ));
  root.appendChild(row(
    group("field_employee_id", textInput("employeeId", { required: true })),
    group("field_designation", textInput("designation", { required: true }))
  ));
  root.appendChild(row(
    group("field_specialisation", textInput("specialisation", { required: true })),
    group("field_place_of_work", textInput("placeOfWork", { required: true }))
  ));

  // ---- Section 3: personal details ----
  root.appendChild(heading("personal_details_heading"));
  root.appendChild(group("field_full_name_aadhaar", textInput("spvrName", { placeholder: t("placeholder_full_name_aadhaar") })));
  root.appendChild(group("field_father_husband", textInput("spvrRelativeName")));
  root.appendChild(row(
    group("field_marital_status", selectInput("maritalStatus", MARITAL_STATUSES)),
    group("field_alt_mobile", textInput("altMobileNo", { maxLength: 10, pattern: "[0-9]{10}", placeholder: t("placeholder_10_digit") }))
  ));
  root.appendChild(group("field_residential_address", textInput("residentialAdrs", { placeholder: t("placeholder_residential_address") })));

  // ---- Section 4: education ----
  root.appendChild(heading("education_heading"));
  const specQualSelect = document.createElement("select");
  const buildSpecQual = () => {
    const options = QUALIFICATIONS_BY_CATEGORY[data.qualification] || [];
    fillSelect(specQualSelect, options, t(data.qualification ? "select_placeholder" : "select_category_first"));
    specQualSelect.disabled = !data.qualification;
    specQualSelect.value = data.specQualification ?? "";
  };
  specQualSelect.name = "specQualification";
  specQualSelect.addEventListener("change", () => {
    data.specQualification = specQualSelect.value;
    onNotify();
  });
  buildSpecQual();
  root.appendChild(group("field_qualification_category", selectInput("qualification", QUALIFICATION_CATEGORIES, {
    onChange: () => {
      data.specQualification = "";
      buildSpecQual();
    },
  })));
  root.appendChild(group("field_specific_qualification", specQualSelect));
  root.appendChild(group("field_university", textInput("uniName")));

  const years = [];
  for (let y = new Date().getFullYear(); y >= 1950; y--) years.push(y.toString());
  root.appendChild(row(
    group("field_year_graduation", selectInput("yearOfGraduation", years, { placeholder: t("select_year") })),
    group("field_specialization", textInput("eduSpecialization", { placeholder: t("placeholder_optional") }))
  ));

  // ---- Section 5: profession ----
  root.appendChild(heading("profession_heading"));
  root.appendChild(group("field_employment_status", selectInput("employmentStatus", EMPLOYMENT_STATUSES)));
  root.appendChild(group("field_sector", selectInput("employmentSector", EMPLOYMENT_SECTORS)));
  root.appendChild(group("field_profession_category", selectInput("professionalCategory", PROFESSIONAL_CATEGORIES, {
    onChange: () => {
      data.specProfession = "";
      buildSpecProfession();
    },
  })));
  const specProfessionSelect = document.createElement("select");
  const buildSpecProfession = () => {
    const options = PROFESSIONS_BY_CATEGORY[data.professionalCategory] || [];
    fillSelect(specProfessionSelect, options, t("select_placeholder"));
    specProfessionSelect.disabled = !data.professionalCategory;
    specProfessionSelect.value = data.specProfession ?? "";
  };
  specProfessionSelect.name = "specProfession";
  specProfessionSelect.addEventListener("change", () => {
    data.specProfession = specProfessionSelect.value;
    onNotify();
  });
  buildSpecProfession();
  root.appendChild(row(
    group("field_role", specProfessionSelect),
    group("field_exp_years", textInput("profYearsOfExp", { maxLength: 2 }))
  ));

  // ---- Section 6: experience & references ----
  root.appendChild(heading("experience_refs_heading"));
  const prevVolGroup = document.createElement("div");
  prevVolGroup.className = "form-group";
  prevVolGroup.innerHTML = `<label>${t("field_previously_volunteered")}</label>`;
  prevVolGroup.appendChild(radioGroup("previouslyVolunteered", [["true", "yes_label"], ["false", "no_label"]]));
  root.appendChild(prevVolGroup);

  const prevVolExtra = document.createElement("div");
  prevVolExtra.appendChild(row(
    group("field_no_of_times", textInput("noOfParticipation", { maxLength: 2 })),
    group("field_last_2_periods", textInput("lastTwoSevaPeriods", { placeholder: t("placeholder_e_g_jan_2024") }))
  ));
  prevVolExtra.appendChild(row(
    group("field_other_org", textInput("religiousInstitute")),
    group("field_experience", textInput("volunteeredExp"))
  ));
  root.appendChild(prevVolExtra);

  root.appendChild(group("field_languages", checkboxGrid("languages", LANGUAGES)));

  root.appendChild(group("field_ref_1_name", textInput("firstRefName")));
  root.appendChild(row(
    group("field_details", textInput("firstRefDetails", { placeholder: t("placeholder_relation") })),
    group("field_mobile_short", textInput("firstRefMobileNo", { maxLength: 10 }))
  ));
  root.appendChild(group("field_ref_2_name", textInput("secRefName")));
  root.appendChild(row(
    group("field_details", textInput("secRefDetails", { placeholder: t("placeholder_relation") })),
    group("field_mobile_short", textInput("secRefMobileNo", { maxLength: 10 }))
  ));

  // ---- Section 7: trainer specifics ----
  root.appendChild(heading("trainer_specifics_heading"));
  const trainerGroup = document.createElement("div");
  trainerGroup.className = "form-group";
  trainerGroup.innerHTML = `<label>${t("field_training_experience")}</label>`;
  trainerGroup.appendChild(radioGroup("experiencedTrainer", [["true", "yes_label"], ["false", "no_label"]]));
  root.appendChild(trainerGroup);

  const trainerExtra = document.createElement("div");
  trainerExtra.appendChild(row(
    group("field_institute_name", textInput("trainerInstituteName")),
    group("field_role", textInput("trainerRole"))
  ));
  trainerExtra.appendChild(group("field_exp_desc", textInput("trainerExp")));
  const otherAreaWrap = document.createElement("div");
  const rebuildOtherArea = () => {
    otherAreaWrap.innerHTML = "";
    if ((data.areaOfTrainerExp || []).includes("Others (Specify)")) {
      otherAreaWrap.appendChild(group("field_specify_other_area", textInput("otherAreaOfTrainerExp")));
    }
  };
  trainerExtra.appendChild(group("field_expertise_areas", checkboxGrid("areaOfTrainerExp", TRAINER_EXPERTISE_AREAS, rebuildOtherArea)));
  trainerExtra.appendChild(otherAreaWrap);
  rebuildOtherArea();
  root.appendChild(trainerExtra);

  const otherLocWrap = document.createElement("div");
  const rebuildOtherLoc = () => {
    otherLocWrap.innerHTML = "";
    if (data.preferredLoc === "Other(Specify)") {
      otherLocWrap.appendChild(group("field_specify_location", textInput("otherPreferredLoc")));
    }
  };
  root.appendChild(row(
    group("field_preferred_loc", selectInput("preferredLoc", ["Tirumala", "Tirupati", "Other(Specify)"], { placeholder: t("select_dots"), onChange: rebuildOtherLoc })),
    group("field_commitment", selectInput("timeCommitment", ["Weekdays", "Weekends", "Both"], { placeholder: t("select_dots") })),
    group("field_frequency", selectInput("freq", ["Monthly", "Quarterly", "Yearly", "As required"], { placeholder: t("select_dots") }))
  ));
  root.appendChild(otherLocWrap);
  rebuildOtherLoc();

  function syncConditionals() {
    prevVolExtra.hidden = data.previouslyVolunteered !== "true";
    trainerExtra.hidden = data.experiencedTrainer !== "true";
  }
  syncConditionals();

  // ---- Section 8: uploads ----
  root.appendChild(heading("uploads_heading"));
  root.appendChild(fileRow("field_upload_id_proof", "document", data, onNotify, showMessage));
  root.appendChild(fileRow("field_upload_edu_certificate", "eduCertificate", data, onNotify, showMessage));

  return root;
}
