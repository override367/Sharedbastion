

/**
 * Party Bastion Sheet
 * A custom actor sheet for the Party Bastion, compatible with DnD5e's Bastion system
 */
export class PartyBastionSheet extends Application {
  /**
   * @param {Actor} actor - The Party Bastion actor
   * @param {Object} options - Additional options
   */
   

  /* ------------------------------------------------------------- */
  /*  Handlebars helpers needed by the template (local fallback)   */
  /* ------------------------------------------------------------- */
static _registerHBHelpers() {
  const H = Handlebars.helpers;
  const r = (name, fn) => { if (!H[name]) Handlebars.registerHelper(name, fn); };

  /* math / logic helpers */
  r("subtract",  (a, b) => (Number(a) || 0) - (Number(b) || 0));
  r("multiply",  (a, b) => (Number(a) || 0) * (Number(b) || 0));
  r("divide",    (a, b) => (!b ? 0 : (Number(a) || 0) / (Number(b) || 0)));

  /* flow-control helpers */
  r("let",       (v, opts) => opts.fn(v));
  r("times",     (n, opts) => {            // repeat n times
    let out = "";
    n = Number(n) || 0;
    for (let i = 0; i < n; i++) out += opts.fn(i);
    return out;
  });

  /* comparison helpers */
  r("eq",        (a, b) => a === b);
  r("notEq",     (a, b) => a !== b);
  r("and",       (...args) => args.slice(0, -1).every(Boolean));

  /* string helpers */
r("capitalize", s =>
  (typeof s === "string" && s.length) ? s[0].toUpperCase() + s.slice(1) : s);

  /* NEW ➜ fallback helper used in the template */
  r("default",   (value, fallback) =>
      (value === undefined || value === null || value === "" || value === false)
        ? fallback : value);
}

   
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;

    // Constants for facility types
    this.FACILITY_TYPES = {
      BASIC: "basic",
      SPECIAL: "special"
    };

    // Constants for occupant types
    this.OCCUPANT_TYPES = {
      HIRELING: "hirelings",
      DEFENDER: "defenders",
      CREATURE: "creatures" // Keep for potential future use
    };

    // Maintain selected facility between renders
    const storedFacilityId = actor.getFlag("shared-bastion", "selectedFacility");
    if (storedFacilityId) {
      const facility = actor.items.get(storedFacilityId);
      if (facility && facility.type === 'facility') { // Ensure it's a facility
        this.selectedFacility = facility;
      } else {
        actor.unsetFlag("shared-bastion", "selectedFacility");
        this.selectedFacility = null;
      }
    } else {
      this.selectedFacility = null;
    }

    // Make sure actor has a default image
    if (!this.actor.img || this.actor.img === "icons/svg/mystery-man.svg") {
      this.actor.update({img: "icons/environment/settlement/house-farmland.webp"});
    }
    /* re-render when any of this actor’s facilities are updated */
    this._boundUpdate = (item) => {
      if (item.parent?.id === this.actor.id && item.type === "facility") this.render(false);
    };
    Hooks.on("updateItem", this._boundUpdate);	
	
  }

  /**
   * Default options for the sheet
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "party-bastion-sheet",
      template: "modules/shared-bastion/templates/party-bastion-sheet.hbs",
      classes: ["dnd5e", "sheet", "actor", "party-bastion"],
      width: 720, // Slightly wider to accommodate details
      height: 600, // Slightly taller
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      title: "Party Bastion"
    });
  }

  /**
   * Sheet title
   */
  get title() {
    return `Party Bastion — ${this.actor.name}`;
  }

  /**
   * Prepare data for rendering
   */
  async getData(options) { // getData is already async
    const data = await super.getData(options);
    data.actor = this.actor;

    // Get facility items
    const facilities = this.actor.items.filter(i => i.type === "facility");

    // Split by type
    const getType = (item) => item.system?.type?.value || this.FACILITY_TYPES.BASIC;
    data.basicFacilities = facilities.filter(i => getType(i) === this.FACILITY_TYPES.BASIC);
    data.specialFacilities = facilities.filter(i => getType(i) === this.FACILITY_TYPES.SPECIAL);

    data.selectedFacility = null; // Initialize
    data.enrichedDescription = ""; // Initialize

    // Selected facility processing
    if (this.selectedFacility) {
      // Re-fetch the item from the actor in case it was updated
      const facility = this.actor.items.get(this.selectedFacility.id);
      if (facility && facility.type === 'facility') {
        data.selectedFacility = facility.toObject(false); // Pass a plain object copy to avoid issues
        data.selectedFacility.system = facility.system; // Ensure system data is present
        data.selectedFacility.id = facility.id; // Ensure ID is present
        data.selectedFacility.img = facility.img; // Ensure img is present
        data.selectedFacility.name = facility.name; // Ensure name is present


        // Enrich Description Asynchronously
        const description = facility.system.description?.value || "";
        if (description) {
            try {
                // Use await here and set async: true
                data.enrichedDescription = await TextEditor.enrichHTML(description, {
                    secrets: this.actor.isOwner,
                    rollData: this.actor.getRollData(),
                    async: true, // Crucial: allow async operations like UUID lookup
                    relativeTo: this.actor // context for relative links if any
                });
            } catch (err) {
                console.error(`Shared Bastion | Error enriching facility description for ${facility.name}:`, err);
                data.enrichedDescription = `<p><i>Error displaying description.</i></p><pre>${foundry.utils.escapeHTML(description)}</pre>`; // Fallback on error
            }
        }

        // Get occupants (these methods are async)
        data.hirelings = await this._getOccupants(facility, this.OCCUPANT_TYPES.HIRELING);
        data.defenders = await this._getOccupants(facility, this.OCCUPANT_TYPES.DEFENDER);

        // Get max slots
        data.hireling_max = facility.system.hirelings?.max ?? 0;
        data.defender_max = facility.system.defenders?.max ?? 0;

        // Calculate counts and available slots
        data.hireling_count = data.hirelings?.length || 0;
        data.defender_count = data.defenders?.length || 0;
        data.hireling_available = Math.max(0, data.hireling_max - data.hireling_count);
        data.defender_available = Math.max(0, data.defender_max - data.defender_count);

        // Flags for template logic
        data.hasHirelings = data.hireling_count > 0;
        data.hasDefenders = data.defender_count > 0;

      } else {
        // Facility not found or invalid, clear selection state
        this.selectedFacility = null;
        await this.actor.unsetFlag("shared-bastion", "selectedFacility"); // Also clear the flag
      }
    }

    return data;
  }


  /**
   * Get occupants (hirelings, defenders, etc.) from a facility
   * @param {Item} facility - The facility item
   * @param {string} occupantType - Type of occupant (hirelings, defenders, etc.)
   * @returns {Promise<Array>} - Array of actor data for occupants
   */
  async _getOccupants(facility, occupantType) {
    if (!facility) return [];

    // Get the occupant UUIDs from the facility
    // Ensure it's always an array, even if data is missing/null
    const occupantUUIDs = facility.system[occupantType]?.value ?? [];

    // If no occupants, return empty array
    if (!Array.isArray(occupantUUIDs) || !occupantUUIDs.length) return [];

    // Resolve UUIDs to actors
    const occupants = [];
    for (const uuid of occupantUUIDs) {
        // Skip if uuid is empty or invalid format (basic check)
        if (!uuid || typeof uuid !== 'string' || !uuid.includes('.')) continue;
        try {
            const actor = await fromUuid(uuid);
            if (actor) {
                occupants.push({
                    id: actor.id,
                    uuid: actor.uuid,
                    name: actor.name,
                    img: actor.img || "icons/svg/mystery-man.svg"
                });
            } else {
                 console.warn(`Shared Bastion | Could not resolve occupant UUID: ${uuid} (Actor not found)`);
            }
        } catch (err) {
            console.warn(`Shared Bastion | Failed to resolve occupant UUID: ${uuid}`, err);
        }
    }

    return occupants;
  }

  /**
   * Setup event listeners
   */
  activateListeners(html) {
    super.activateListeners(html);

    const makeKeyClickable = (selector) => {
      html.find(selector).on("keydown", ev => {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          ev.preventDefault();
          ev.currentTarget.click();
        }
      });
    };

        html.find(".order-edit")
    .on("click", this._onOrderEdit.bind(this));
    // Facility Selection
    html.find(".facility-list .facility").on('click', this._onSelectFacility.bind(this));
    makeKeyClickable(".facility-list .facility");

    // Open Character Sheet Button
    html.find(".open-character-sheet").on('click', async ev => {
        ev.preventDefault();
        const actor = this.actor;
        let TargetSheetClass = null;
        let targetSheetKey = null; // Store the registration key for debugging/options

        // 1. Try to find the Tidy5e Sheet Class
        const tidyModule = game.modules.get("tidy5e-sheet");

        // 2. If Tidy5e not found/inactive, find the default DnD5e V3 Sheet
        if (!TargetSheetClass) {
            console.log("Shared Bastion | Tidy5e sheet not found or inactive. Finding default DnD5e sheet.");
            try {
                const defaultReg = Object.values(CONFIG.Actor.sheetClasses.character ?? {}).find(reg => reg.default);
                if (defaultReg) {
                    TargetSheetClass = defaultReg.cls;
                    targetSheetKey = Object.keys(CONFIG.Actor.sheetClasses.character).find(k => CONFIG.Actor.sheetClasses.character[k].cls === TargetSheetClass);
                    console.log(`Shared Bastion | Found default sheet class via default registration: ${targetSheetKey || 'Unknown Key'}`);
                } else {
                    targetSheetKey = "dnd5e.ActorSheet5eCharacter";
                    if (CONFIG.Actor.sheetClasses.character[targetSheetKey]?.cls) {
                        TargetSheetClass = CONFIG.Actor.sheetClasses.character[targetSheetKey].cls;
                        console.log(`Shared Bastion | Using fallback default sheet class: ${targetSheetKey}`);
                    } else {
                         throw new Error(`Sheet class for key ${targetSheetKey} not found.`);
                    }
                }
            } catch (e) {
                console.error("Shared Bastion | Could not find a default dnd5e character sheet class.", e);
                ui.notifications.error("Could not determine the default character sheet to open.");
                return;
            }
        }

        // 3. Render the Target Sheet
        if (TargetSheetClass) {
            console.log(`Shared Bastion | Attempting to render sheet: ${targetSheetKey || 'Identified Class'}`);
            try {
                const existingSheet = Object.values(actor.apps).find(app => app.actor === actor && app instanceof TargetSheetClass && app._state > Application.RENDER_STATES.CLOSED);

                if (existingSheet) {
                    console.log("Shared Bastion | Target sheet already open. Bringing to front.");
                    existingSheet.render(true, { focus: true });
                    existingSheet.maximize();
                } else {
                    console.log("Shared Bastion | Creating new instance of target sheet.");
                    const sheet = new TargetSheetClass(actor, {});
                    sheet.render(true, { focus: true });
                }
            } catch (e) {
                console.error(`Shared Bastion | Failed to instantiate or render target sheet (${targetSheetKey || 'Identified Class'}):`, e);
                ui.notifications.error("Failed to open the character sheet. Check console (F12) for details.");
            }
        } else {
            console.error("Shared Bastion | No target sheet class could be determined after checks.");
            ui.notifications.error("Could not find any suitable character sheet to open.");
        }
    });

    // Change Bastion Image
    html.find(".bastion-portrait").on('click', this._onChangeBastionImage.bind(this));
    makeKeyClickable(".bastion-portrait");

    // Add Facility Buttons
    html.find(".add-facility").on('click', this._onAddFacility.bind(this));
    makeKeyClickable(".add-facility");

    // Open Occupant Sheet
    html.find(".occupant-avatar").on('click', this._onOpenOccupantSheet.bind(this));
    makeKeyClickable(".occupant-avatar");

    // Assign Occupant Buttons (both placeholders and dedicated buttons)
    html.find(".assign-hireling").on('click', ev => this._onAssignOccupant(ev, this.OCCUPANT_TYPES.HIRELING));
    html.find(".assign-defender").on('click', ev => this._onAssignOccupant(ev, this.OCCUPANT_TYPES.DEFENDER));
    makeKeyClickable(".assign-hireling");
    makeKeyClickable(".assign-defender");

    // Remove Occupant Button
    html.find(".occupant-remove").on('click', this._onRemoveOccupant.bind(this));
    makeKeyClickable(".occupant-remove");

    // --- Optional: Style adjustments via JS if needed ---
    // Prevent accidental text selection on facility labels
    html.find(".facility-label").css({
      "user-select": "none",
      "-webkit-user-select": "none"
    });
  }

  /**
   * Handle facility selection
   */
  _onSelectFacility(event) {
    event.preventDefault();
    event.stopPropagation();

    const facilityId = event.currentTarget.dataset.facilityId;
    if (!facilityId) return;

    // Avoid re-render if already selected
    if (this.selectedFacility && this.selectedFacility.id === facilityId) {
        return;
    }

    const facility = this.actor.items.get(facilityId);
    if (facility && facility.type === 'facility') {
        this.selectedFacility = facility;
        // Save the selection
        this.actor.setFlag("shared-bastion", "selectedFacility", facility.id).then(() => {
            // Render after flag is set
            this.render(false);
        });
    } else {
        console.warn(`Shared Bastion | Facility with ID ${facilityId} not found or not a facility item.`);
        // Clear selection if invalid
        this.selectedFacility = null;
        this.actor.unsetFlag("shared-bastion", "selectedFacility").then(() => {
            this.render(false);
        });
    }
  }

  /**
   * Change bastion portrait image
   */
  async _onChangeBastionImage(event) {
    event.preventDefault();
    const currentImg = this.actor.img;
    const fp = new FilePicker({
        type: "image",
        current: currentImg,
        callback: path => {
            // Only update if the path actually changed
            if (path && path !== currentImg) {
                this.actor.update({ img: path });
            }
        },
        top:  this.position.top  + 40,
        left: this.position.left + 10
    });
    await fp.browse(); // Use await for better flow
  }

  /**
   * Add a new facility using Compendium Browser or fallback
   */
  async _onAddFacility(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type || this.FACILITY_TYPES.BASIC;

    if (game.dnd5e?.applications?.compendium?.CompendiumBrowser) {
        try {
            // Define filters matching the bastion system expectations
            const filters = {
                item: {
                    type: { value: ["facility"], exact: true }, // Ensure only facility type
                    // Add other filters if needed, e.g., level, source
                }
            };
            game.dnd5e.applications.compendium.CompendiumBrowser.browse(
                filters,
                { item: true } // Specify we are browsing for items
            ).then(uuids => {
                // Callback receives an array of UUIDs
                if (uuids && uuids.length > 0) {
                    this._onFacilitySelection(uuids, type); // Pass UUIDs to handler
                }
            });
        } catch (error) {
            console.error("Shared Bastion | Error opening compendium browser:", error);
            ui.notifications.warn("Compendium Browser unavailable or failed. Creating a basic facility instead.");
            await this._createCustomFacility(type); // Fallback
        }
    } else {
        console.warn("Shared Bastion | DnD5e Compendium Browser not found. Creating a basic facility.");
        await this._createCustomFacility(type); // Fallback
    }
  }

  /**
   * Handle facility selection from compendium (using UUIDs)
   */
  async _onFacilitySelection(uuids, defaultType) {
    if (!uuids || uuids.length === 0) return;

    const itemsData = [];
    let firstNewItemName = null; // To select the first added item

    for (const uuid of uuids) {
        try {
            const item = await fromUuid(uuid);
            if (item && item.type === "facility") {
                const itemData = item.toObject(); // Get plain data

                // Ensure system object exists
                itemData.system = itemData.system ?? {};
                itemData.system.type = itemData.system.type ?? {};
                itemData.system.hirelings = itemData.system.hirelings ?? {};
                itemData.system.defenders = itemData.system.defenders ?? {};

                // Set type if missing, preferring item's data
                if (!itemData.system.type.value) {
                    itemData.system.type.value = defaultType;
                }

                // Ensure hirelings/defenders have 'value' as array and 'max'
                if (!Array.isArray(itemData.system.hirelings.value)) {
                     itemData.system.hirelings.value = [];
                }
                 itemData.system.hirelings.max = itemData.system.hirelings.max ?? (itemData.system.type.value === this.FACILITY_TYPES.BASIC ? 2 : 1); // Sensible default

                if (!Array.isArray(itemData.system.defenders.value)) {
                    itemData.system.defenders.value = [];
                }
                itemData.system.defenders.max = itemData.system.defenders.max ?? 0; // Default max 0

                itemsData.push(itemData);
                if (!firstNewItemName) firstNewItemName = itemData.name;
            }
        } catch (err) {
            console.error(`Shared Bastion | Error processing selected facility UUID ${uuid}:`, err);
        }
    }

    if (itemsData.length > 0) {
        const createdItems = await this.actor.createEmbeddedDocuments("Item", itemsData);

        // If items were created, select the first one added
        if (createdItems && createdItems.length > 0) {
            const newItem = createdItems[0]; // The first item actually created
             if (newItem) {
                this.selectedFacility = newItem;
                await this.actor.setFlag("shared-bastion", "selectedFacility", this.selectedFacility.id);
            }
        }
        this.render(false); // Re-render after adding
    }
  }


  /**
   * Create a default custom facility (fallback)
   */
  async _createCustomFacility(type) {
    const facilityData = {
      name: type === this.FACILITY_TYPES.BASIC ? "New Basic Facility" : "New Special Facility",
      type: "facility",
      img: `icons/environment/settlement/${type === this.FACILITY_TYPES.BASIC ? "house" : "tower"}.webp`,
      system: {
        description: { value: type === this.FACILITY_TYPES.BASIC ? "A basic facility for the party's bastion." : "A special facility with unique capabilities." },
        type: { value: type },
        prerequisite: { value: "" }, // Default empty
        space: { value: "Medium" }, // Default Medium
        hirelings: { value: [], max: type === this.FACILITY_TYPES.BASIC ? 2 : 1 },
        defenders: { value: [], max: 0 },
        order: { type: "None", details: "" } // Default None
        // Add level or category if needed by your system view
        // category: type === this.FACILITY_TYPES.BASIC ? "Basic" : "Special",
        // level: 5 // Or derive based on actor?
      }
    };

    const createdItems = await this.actor.createEmbeddedDocuments("Item", [facilityData]);
    if (createdItems && createdItems.length > 0) {
      this.selectedFacility = createdItems[0];
      await this.actor.setFlag("shared-bastion", "selectedFacility", this.selectedFacility.id);
      this.render(false); // Re-render after creation
    }
  }

  /**
   * Open occupant character sheet
   */
  async _onOpenOccupantSheet(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;
    if (uuid) {
      try {
        const actor = await fromUuid(uuid);
        if (actor) {
          actor.sheet?.render(true, { focus: true });
        } else {
           ui.notifications.warn(`Could not find actor for UUID: ${uuid}`);
        }
      } catch (err) {
        console.error(`Shared Bastion | Error opening occupant sheet for ${uuid}:`, err);
        ui.notifications.error(`Could not open sheet for ${uuid}`);
      }
    }
  }

  /**
   * Assign occupants to the selected facility
   */
  async _onAssignOccupant(event, occupantType) {
    event.preventDefault();
    if (!this.selectedFacility) {
        ui.notifications.warn("Please select a facility first.");
        return;
    }

    // Re-fetch the facility item to ensure we have the latest data
    const facility = this.actor.items.get(this.selectedFacility.id);
    if (!facility) {
        ui.notifications.error("Selected facility not found.");
        return;
    }

    // Get current state
    const currentUUIDs = facility.system[occupantType]?.value ?? [];
    const maxOccupants = facility.system[occupantType]?.max ?? 0;
    const currentCount = currentUUIDs.length;
    const availableSlots = maxOccupants - currentCount;

    if (maxOccupants <= 0) {
      ui.notifications.warn(`This facility cannot have ${occupantType}.`);
      return;
    }

    if (availableSlots <= 0) {
      ui.notifications.warn(`This facility already has the maximum number of ${occupantType} (${maxOccupants}).`);
      return;
    }

    // Use dnd5e ActorSelector if available
    if (game.dnd5e?.applications?.actor?.ActorSelector) {
      try {
        const selector = new game.dnd5e.applications.actor.ActorSelector({
          title: `Select ${occupantType} (Up to ${availableSlots} more)`,
          label: `Select ${occupantType}`,
          type: ["character", "npc"],
          current: currentUUIDs, // Pass current UUIDs so they are pre-selected/shown
          maximum: maxOccupants, // Set the maximum allowed selection
          callback: async (uuids) => {
            // The callback provides the full list of selected UUIDs
            if (uuids) {
              // Ensure the list doesn't exceed the max (selector should handle this, but double-check)
              const finalUUIDs = uuids.slice(0, maxOccupants);

              // Update the facility item directly
              await facility.update({
                [`system.${occupantType}.value`]: finalUUIDs
              });

              // Re-render this sheet to show changes
              this.render(false);
            }
          }
        }, {
            width: 320 // Adjust width if needed
        });
        selector.render(true);
        return; // Exit after launching the selector
      } catch (error) {
        console.error("Shared Bastion | Error using ActorSelector:", error);
        ui.notifications.warn("Actor Selector failed. Using fallback selection.");
        // Fall through to custom dialog if ActorSelector fails
      }
    }

    // --- Fallback Custom Dialog (simplified) ---
    ui.notifications.error("Actor selection requires dnd5e system's ActorSelector (or enable it). Manual assignment not fully implemented here.");
    // Implement the complex dialog from previous examples here if needed as a fallback.
  }


 /**
   * Remove an occupant from the selected facility
   */
  async _onRemoveOccupant(event) {
    event.preventDefault();
    event.stopPropagation(); // Prevent triggering other clicks like opening sheet

    const button = event.currentTarget;
    const uuid = button.dataset.uuid;
    const occupantType = button.dataset.type; // 'hirelings' or 'defenders'

    if (!uuid || !occupantType || !this.selectedFacility) return;

    // Re-fetch the facility item to ensure latest data
    const facility = this.actor.items.get(this.selectedFacility.id);
    if (!facility) return;

    const currentUUIDs = facility.system[occupantType]?.value ?? [];
    const updatedUUIDs = currentUUIDs.filter(id => id !== uuid);

    // Update the facility item
    await facility.update({
        [`system.${occupantType}.value`]: updatedUUIDs
    }).then(() => {
        // Re-render this sheet after update is successful
        this.render(false);
    });
  }

/**
 * Delegate “edit order” to Tidy5e.
 */
/**
 * Handle the ✎ click – delegate to Tidy5e sheet
 */
async _onOrderEdit(ev) {
  ev.preventDefault();

  const facilityId = ev.currentTarget.dataset.facilityId;
  const facility   = this.actor.items.get(facilityId);
  if (!facility) return;

/* 1️ Let other modules intercept */
  if (Hooks.call("tidy5eSheetsFacilityOrderClicked",
                 { sheet: this, actor: this.actor, facility }) === false) return;

  /* 2️⃣  Bring an already-open character sheet (any class) to front */
  const openSheet = Object.values(this.actor.apps)
    .find(app => app !== this && app._state > 0);
  if (openSheet) {
    openSheet.render(true, { focus: true, tab: "bastion" });
    return;
  }

  /* 3️⃣  Otherwise create the user’s *default* character sheet
         (this is exactly the logic used by the “Character Sheet” button) */
  try {
    const reg = Object.values(CONFIG.Actor.sheetClasses.character || {})
                 .find(r => r.default);
    const SheetClass = reg?.cls
        ?? CONFIG.Actor.sheetClasses.character["dnd5e.ActorSheet5eCharacter"]?.cls;

    if (!SheetClass) throw new Error("Could not locate a default sheet class");

    const sheet = new SheetClass(this.actor, { editable: true });
    // open on the Bastion tab if the sheet supports it
    sheet.render(true, { focus: true, tab: "bastion" });
  } catch (err) {
    console.error("Shared Bastion | order dialog fallback failed:", err);
    ui.notifications.error("Couldn’t open the Tidy5e order editor.");
  }
}
} // End of PartyBastionSheet class

/* ---------------------------------------------------- */
/*  call helper registration *outside* the class body   */
/* ---------------------------------------------------- */
PartyBastionSheet._registerHBHelpers();