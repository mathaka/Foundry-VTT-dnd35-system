/**
 * The Dungeons & Dragons 3.5th Edition game system for Foundry Virtual Tabletop
 * Author: red5h4d0w
 * Software License: GNU GPLv3
 * Content License: https://media.wizards.com/2016/downloads/DND/SRD-OGL_V5.1.pdf
 * Repository: https://github.com/red5h4d0w/Foundry-VTT-dnd3.5-system
 * Issue Tracker: https://github.com/red5h4d0w/Foundry-VTT-dnd3.5-system/issues
 */

// Import Modules
import { DND35E } from "./module/config.js";
import { registerSystemSettings } from "./module/settings.js";
import { preloadHandlebarsTemplates } from "./module/templates.js";
import { _getInitiativeFormula } from "./module/combat/entity.js";
import { measureDistance, getBarAttribute } from "./module/canvas.js";
import { Actor35e } from "./module/actor/entity.js";
import { ActorSheet35eCharacter } from "./module/actor/sheets/character.js";
import { Combat35e } from "./module/combat/entity.js";
import { Item35e } from "./module/item/entity.js";
import { ItemSheet35e } from "./module/item/sheet.js";
import { ActorSheet35eNPC } from "./module/actor/sheets/npc.js";
import { Dice35e } from "./module/dice.js";
import * as chat from "./module/chat.js";
import * as migrations from "./module/migration.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", function() {
  console.log(`D&D3.5e | Initializing Dungeons & Dragons 3.5th Edition System\n${DND35E.ASCII}`);

  // Create a D&D3.5E namespace within the game global
  game.dnd35e = {
    Actor35e,
    Combat35e,
    Dice35e,
    Item35e,
    migrations,
    rollItemMacro,
  };

  // Record Configuration Values
  CONFIG.DND35E = DND35E;
  console.log(CONFIG.DND35E);
  CONFIG.Actor.entityClass = Actor35e;
  CONFIG.Combat.entityClass = Combat35e
  CONFIG.Item.entityClass = Item35e;

  // Register System Settings
  registerSystemSettings();


  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dnd35e", ActorSheet35eCharacter, { types: ["character"], makeDefault: true });
  Actors.registerSheet("dnd35e", ActorSheet35eNPC, { types: ["npc"], makeDefault: true });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("dnd35e", ItemSheet35e, {makeDefault: true});

  // Preload Handlebars Templates
  preloadHandlebarsTemplates();
});


/* -------------------------------------------- */
/*  Foundry VTT Setup                           */
/* -------------------------------------------- */

/**
 * This function runs after game data has been requested and loaded from the servers, so entities exist
 */
Hooks.once("setup", function() {

  // Localize CONFIG objects once up-front
  /*
  const toLocalize = [
    "abilities", "alignments", "conditionTypes", "consumableTypes", "currencies", "damageTypes", "distanceUnits", "equipmentTypes",
    "healingTypes", "itemActionTypes", "limitedUsePeriods", "senses", "skills", "spellComponents", "spellLevels", "spellPreparationModes",
    "spellSchools", "spellScalingModes", "targetTypes", "timePeriods", "weaponProperties", "weaponTypes"
  ];
  for ( let o of toLocalize ) {
    CONFIG.DND35E[o] = Object.entries(CONFIG.DND35E[o]).reduce((obj, e) => {
      obj[e[0]] = game.i18n.localize(e[1]);
      return obj;
    }, {});
  }
  */
});

/* -------------------------------------------- */

/**
 * Once the entire VTT framework is initialized, check to see if we should perform a data migration
 */
Hooks.once("ready", function() {

  // Determine whether a system migration is required and feasible
  const currentVersion = parseFloat(game.settings.get("dnd35e", "systemMigrationVersion"));
  console.log(currentVersion);
  const COMPATIBLE_MIGRATION_VERSION = 0.117;
  let needMigration = false;
  const canMigrate = currentVersion >= COMPATIBLE_MIGRATION_VERSION;

  // Perform the migration
  if ( needMigration && game.user.isGM ) {
    if ( !canMigrate ) {
      ui.notifications.error(`Your D&D3.5E system data is from too old a Foundry version and cannot be reliably migrated to the latest version. The process will be attempted, but errors may occur.`, {permanent: true});
    }
    migrations.migrateWorld();
  }
});

/* -------------------------------------------- */
/*  Canvas Initialization                       */
/* -------------------------------------------- */

Hooks.on("canvasInit", function() {

  // Extend Diagonal Measurement
  canvas.grid.diagonalRule = game.settings.get("dnd35e", "diagonalMovement");
  SquareGrid.prototype.measureDistance = measureDistance;

  // Extend Token Resource Bars
  Token.prototype.getBarAttribute = getBarAttribute;
});

/* -------------------------------------------- */
/*  Combat Hooks                                */
/* -------------------------------------------- */

Hooks.on("deleteCombat", (combat, combatId, options, userId) => {
  Combat35e.hookOnDeleteCombat(combat, combatId, options, userId);
});
console.log("combat ready");


/* -------------------------------------------- */
/*  Other Hooks                                 */
/* -------------------------------------------- */

Hooks.on("renderChatMessage", (app, html, data) => {

  // Display action buttons
  chat.displayChatActionButtons(app, html, data);

  // Highlight critical success or failure die
  chat.highlightCriticalSuccessFailure(app, html, data);

  // Optionally collapse the content
  if (game.settings.get("dnd35e", "autoCollapseItemCards")) html.find(".card-content").hide();
});
Hooks.on("getChatLogEntryContext", chat.addChatMessageContextOptions);
Hooks.on("renderChatLog", (app, html, data) => Item35e.chatListeners(html));


/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function create35eMacro(data, slot) {
  if ( data.type !== "Item" ) return;
  if (!( "data" in data ) ) return ui.notifications.warn("You can only create macro buttons for owned Items");
  const item = data.data;

  // Create the macro command
  const command = `game.dnd35e.rollItemMacro("${item.name}");`;
  let macro = game.macros.entities.find(m => (m.name === item.name) && (m.command === command));
  if ( !macro ) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: {"dnd35e.itemMacro": true}
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if ( speaker.token ) actor = game.actors.tokens[speaker.token];
  if ( !actor ) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find(i => i.name === itemName) : null;
  if ( !item ) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  // Trigger the item roll
  if ( item.data.type === "spell" ) return actor.useSpell(item);
  return item.roll();
}