import { PartyBastionSheet } from "./party-bastion-sheet.js";

// Constants for the shared-bastion module
const MODULE = {
  ID: "shared-bastion",
  NAME: "Shared Bastion",
  FLAGS: {
    IS_PARTY_BASTION: "isPartyBastion",
    SELECTED_FACILITY: "selectedFacility"
  }
};

// Log prefix
const log = msg => console.log(`${MODULE.NAME} | ${msg}`);

/**
 * Initialize the module
 */
Hooks.once("init", () => {
  log("Initializing...");
/* ------------------------------------------------------------------
   Handlebars helpers used by the Party-Bastion sheet
   ------------------------------------------------------------------ */


  //  a !== b
  Handlebars.registerHelper("notEq", (a, b) => a !== b);
Handlebars.registerHelper("capitalize", s =>
  (typeof s === "string" && s.length)
    ? s[0].toUpperCase() + s.slice(1)
    : s
);
  //  math helpers (numbers only)
  Handlebars.registerHelper("subtract", (a, b) => (Number(a) || 0) - (Number(b) || 0));
  Handlebars.registerHelper("multiply", (a, b) => (Number(a) || 0) * (Number(b) || 0));
  Handlebars.registerHelper("divide",   (a, b) => !b ? 0 : (Number(a) || 0) / (Number(b) || 0));

  /* {{#let value as |v|}} … {{/let}} — mirrors Ember’s helper */
  Handlebars.registerHelper("let", function(value, options) {
    // use `options.fn` so the block renders with `value` as context
    return options.fn(value);
  });


  
  // Register module settings
  game.settings.register(MODULE.ID, "folderId", {
    name: "Party Bastion Folder",
    hint: "Folder for the Party Bastion actor.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE.ID, "actorName", {
    name: "Party Bastion Name",
    hint: "Name of the shared Bastion actor.",
    scope: "world",
    config: true,
    type: String,
    default: "Party Bastion"
  });

  // Register facility item type in the dnd5e system if it doesn't already exist
  // Most likely the dnd5e system already defines this, but we'll check to be safe
  if (!CONFIG.Item.typeLabels?.facility) {
    CONFIG.Item.typeLabels = {
      ...CONFIG.Item.typeLabels,
      facility: "Facility"
    };
  }
  
  // Add facility type to documentTypes if it's not already there
  if (!CONFIG.Item.documentClass.TYPES.includes("facility")) {
    CONFIG.Item.documentClass.TYPES.push("facility");
  }

  // Ensure facility type works with the compendium browser
  if (game.dnd5e?.applications?.compendium?.CompendiumBrowser) {
    const browser = game.dnd5e.applications.compendium.CompendiumBrowser;
    if (browser.ITEM_TYPES && !browser.ITEM_TYPES.includes("facility")) {
      browser.ITEM_TYPES.push("facility");
    }
    
    // Add to the filter list if possible
    if (browser.filters?.item?.type?.options) {
      const typeOptions = browser.filters.item.type.options;
      if (!typeOptions.find(t => t[0] === "facility")) {
        typeOptions.push(["facility", "Facility"]);
      }
    }
  }

  // Register templates
  loadTemplates([
    `modules/${MODULE.ID}/templates/party-bastion-sheet.hbs`,
    `modules/${MODULE.ID}/templates/facility-list-item.hbs`,
    `modules/${MODULE.ID}/templates/facility-details.hbs`
  ]);
  
  // Register the sheet application for the custom sheet
  Actors.registerSheet("dnd5e", PartyBastionSheet, {
    types: ["character"],
    makeDefault: false,
    label: "Party Bastion Sheet"
  });
});

/**
 * Setup the module when ready
 */
Hooks.once("ready", async () => {
  log("Setting up...");
  
  // Get settings
  const name = game.settings.get(MODULE.ID, "actorName");
  let folderId = game.settings.get(MODULE.ID, "folderId");
  let folder = folderId ? game.folders.get(folderId) : null;
  
  // Create folder if needed
  if (!folder) {
    folder = await Folder.create({ name, type: "Actor" });
    await game.settings.set(MODULE.ID, "folderId", folder.id);
  }
  
  // Find or create the Party Bastion actor
  let party = game.actors.find(a => a.name === name);
  if (!party) {
    // Create a new level 5 fighter (matches dnd5e bastion level requirements)
    party = await Actor.create({
      name,
      type: "character",
      folder: folder.id,
      img: "icons/environment/settlement/house-farmland.webp",
      flags: { [MODULE.ID]: { [MODULE.FLAGS.IS_PARTY_BASTION]: true } },
      system: {
        details: { level: 5 },
        classes: { fighter: { levels: 5, subclass: "" } }
      }
    });
    log(`Created new Party Bastion '${name}'`);
  } else {
    // Update existing actor if needed
    if (party.folder?.id !== folder.id) {
      await party.update({ folder: folder.id });
    }
    
    // Make sure it's a level 5 fighter (minimum for bastion)
    if (party.system.details.level !== 5 || !party.system.classes?.fighter) {
      await party.update({
        "system.details.level": 5,
        "system.classes.fighter": { levels: 5, subclass: "" }
      });
    }
    
    // Update image if using old default
    if (party.img === "icons/structures/buildings/house-wooden-simple.webp") {
      await party.update({ img: "icons/environment/settlement/house-farmland.webp" });
    }
    
    // Make sure it has the right flag
    if (!party.getFlag(MODULE.ID, MODULE.FLAGS.IS_PARTY_BASTION)) {
      await party.setFlag(MODULE.ID, MODULE.FLAGS.IS_PARTY_BASTION, true);
    }
  }
  
  // Force the use of our custom sheet
  const sheetClass = "dnd5e.PartyBastionSheet";
  if (party.sheet?.template !== `modules/${MODULE.ID}/templates/party-bastion-sheet.hbs`) {
    await party.setFlag("core", "sheetClass", sheetClass);
  }
  
  // Create example facilities if none exist
  const hasFacilities = party.items.some(i => i.type === "facility");
  if (!hasFacilities) {
    const facilityData = [
      {
        name: "Common Room",
        type: "facility",
        img: "icons/environment/settlement/tavern-interior.webp",
        system: {
          description: { value: "A cozy common area for the party to gather, plan, and relax." },
          type: { value: "basic" },
          prerequisite: { value: "None" },
          space: { value: "Large" },
          hirelings: { 
            value: [], // Array of UUIDs for compatibility with dnd5e
            max: 2 
          },
          defenders: {
            value: [],
            max: 0
          },
          order: { type: "None", details: "" }
        }
      },
      {
        name: "Armory",
        type: "facility",
        img: "icons/environment/settlement/blacksmith.webp",
        system: {
          description: { value: "Storage for weapons and armor, with facilities for maintenance." },
          type: { value: "basic" },
          prerequisite: { value: "None" },
          space: { value: "Medium" },
          hirelings: { 
            value: [], 
            max: 1 
          },
          defenders: {
            value: [],
            max: 0
          },
          order: { type: "None", details: "" }
        }
      },
      {
        name: "Arcane Study",
        type: "facility",
        img: "icons/environment/settlement/library.webp",
        system: {
          description: { value: "A quiet study for arcane research and spell preparation." },
          type: { value: "special" },
          prerequisite: { value: "Arcane Spellcaster" },
          space: { value: "Small" },
          hirelings: { 
            value: [], 
            max: 1 
          },
          defenders: {
            value: [],
            max: 0
          },
          order: { type: "None", details: "" }
        }
      }
    ];
    
    await party.createEmbeddedDocuments("Item", facilityData);
    log("Created example facilities");
  }
  
  log(`Party Bastion '${name}' ready in folder '${folder.name}'`);
});

// Add button to token controls
Hooks.on("getSceneControlButtons", (controls) => {
  log("Adding button to token controls");
  
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "party-bastion",
      title: `Open ${game.settings.get(MODULE.ID, "actorName")}`,
      icon: "fas fa-home",
      button: true,
      visible: true,
      onClick: () => {
        // Safely open the party bastion
        const name = game.settings.get(MODULE.ID, "actorName");
        const party = game.actors.getName(name);
        
        if (!party) {
          ui.notifications.error(`Party Bastion '${name}' not found!`);
          return;
        }
        
        // Create a new instance directly
        const sheet = new PartyBastionSheet(party);
        sheet.render(true);
      }
    });
  }
});


// Hook into tidy5eSheetsAddFacilityClicked for potential tidy5e sheet integration
Hooks.on("tidy5eSheetsAddFacilityClicked", (sheet, facilityType) => {
  // If this is our party bastion sheet, we handle this elsewhere
  if (sheet.actor.getFlag(MODULE.ID, MODULE.FLAGS.IS_PARTY_BASTION)) {
    return true; // Prevent default
  }
  return false; // Allow default
});

// Export constants for use in other modules
export const CONSTANTS = {
  MODULE,
  FACILITY_TYPE: {
    BASIC: "basic",
    SPECIAL: "special"
  }
};