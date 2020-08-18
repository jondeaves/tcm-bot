import Discord, { Message } from 'discord.js';
import random from 'roguelike/utility/random';
import Map from './types/Map';
import Vector2 from '../core/types/Vector2';

import container from '../inversity.config';

import ConfigService from '../core/services/config.service';
import DatabaseService from '../core/services/database.service';

import Campaign from './campaign/campaign.entity';
import Character from './character/character.entity';
import Monster from './character/monster.entity';

export default class CampaignManager {
  private _configService: ConfigService = container.resolve<ConfigService>(ConfigService);

  private _databaseService: DatabaseService;

  private _campaign: Campaign;

  constructor(databaseService: DatabaseService, discordClient: Discord.Client, campaign: Campaign) {
    this._databaseService = databaseService;
    this._campaign = campaign;
  }

  public async execute(message: Message): Promise<void> {
    const prefix = this._configService.get('CAMPAIGN_TRIGGER');
    const modRoleID = this._configService.get('CAMPAIGN_MODERATOR_ROLE_ID');
    const hasModPermissions = message.member.roles.cache.has(modRoleID);

    const matchedCharIndex = this._campaign.characters.findIndex((char) => char.uid === message.author.id);
    const matchedChar = this._campaign.characters[matchedCharIndex];

    if (!message.content.toLowerCase().startsWith(prefix)) {
      return;
    }

    const args = message.content.slice(prefix.length).trim().split(/ +/);

    // TODO: Handle commands better
    if (args[0]) {
      switch (args[0]) {
        default:
          message.reply(`I don't recognize that command. Try again or type \`help\` for a list of commands.`);
          break;
        case 'info': {
          message.channel.send(`Welcome to campaign ${this._campaign.id}`);
          message.channel.send(`There are ${this._campaign.characters.length} weary travellers.`);
          break;
        }
        case 'status': {
          const msg = [];
          msg.push(`> **${matchedChar.name}** stops for a moment to look at themselves.`);
          msg.push(
            `> HP: ${':heart:'.repeat(matchedChar.current_health)}${':broken_heart:'.repeat(
              matchedChar.max_health - matchedChar.current_health,
            )}`,
          );
          msg.push(`> :crossed_swords: ${matchedChar.power} :shield: ${matchedChar.defense}`);
          message.channel.send(msg.join(`\n`));
          break;
        }
        case 'stop':
          if (hasModPermissions) {
            this._databaseService.manager.delete(Campaign, this._campaign.id);
            message.channel.send(`The campaign has ended!`);
          } else {
            message.reply(
              `unfortunately you do not have permission to run that command. Contact a moderator to discuss your intentions.`,
            );
          }
          break;
        case 'leave': {
          if (matchedCharIndex >= 0) {
            this._campaign.characters.splice(matchedCharIndex, 1);
            this._databaseService.manager.save(this._campaign);
            message.reply(`your character **${matchedChar.name}** has left the campaign.`);
            return;
          }
          message.reply(`I couldn't find your character. Reach out to a moderator to help you out with this issue.`);
          break;
        }
        case 'w':
        case 'walk': {
          if (args[1]) {
            const map = JSON.parse(this._campaign.dungeon);
            switch (args[1]) {
              default:
                message.channel.send(`> ${matchedChar.name} remains in place.`);
                break;
              case 'n':
                if (
                  matchedChar.position.y - 1 <= 0 ||
                  map.world[matchedChar.position.y - 1][matchedChar.position.x] === 2
                ) {
                  message.channel.send(`> ${matchedChar.name} cannot pass that way.`);
                } else {
                  matchedChar.position.y -= 1;
                  message.channel.send(`> ${matchedChar.name} takes a step, northward.`);
                }
                break;
              case 'e':
                if (
                  matchedChar.position.x + 1 >= map.width ||
                  map.world[matchedChar.position.y][matchedChar.position.x + 1] === 2
                ) {
                  message.channel.send(`> ${matchedChar.name} cannot pass that way.`);
                } else {
                  matchedChar.position.x += 1;
                  message.channel.send(`> ${matchedChar.name} takes a step, eastward.`);
                }
                break;
              case 'w':
                if (
                  matchedChar.position.x - 1 <= 0 ||
                  map.world[matchedChar.position.y][matchedChar.position.x - 1] === 2
                ) {
                  message.channel.send(`> ${matchedChar.name} cannot pass that way.`);
                } else {
                  matchedChar.position.x -= 1;
                  message.channel.send(`> ${matchedChar.name} takes a step, westward.`);
                }
                break;
              case 's':
                if (
                  matchedChar.position.y + 1 >= map.height ||
                  map.world[matchedChar.position.y + 1][matchedChar.position.x] === 2
                ) {
                  message.channel.send(`> ${matchedChar.name} cannot pass that way.`);
                } else {
                  matchedChar.position.y += 1;
                  message.channel.send(`> ${matchedChar.name} takes a step, southward.`);
                }
                break;
            }
            await this._databaseService.manager.save(matchedChar);
            await this.monsterTurn(message.channel, map);
          }
          break;
        }
        case 'map':
          {
            const map = JSON.parse(this._campaign.dungeon);
            if (args[1] && args[1] === 'loc') {
              message.channel.send(matchedChar.position);
              break;
            }
            const msg = [];
            const sight = args[1] && args[1] === 'all' ? -1 : 3;

            const mapMarkers = {
              0: ':white_large_square:',
              1: ':black_large_square:',
              2: ':white_large_square:',
              3: ':door:',
              4: ':door:',
              5: 'checkered_flag',
              6: 'triangular_flag_on_post',
            };

            for (let i = 0; i < map.world.length; i += 1) {
              let line = '';
              for (let j = 0; j < map.world[i].length; j += 1) {
                const vec = new Vector2(j, i);
                const playerHere = this._campaign.characters.find((char) => this.isPlayerHere(char, vec));
                const monsterHere = this._campaign.monsters.find((mon) => this.isMonsterHere(mon, vec));
                if (this.isInRange(matchedChar.position, vec, sight) || sight === -1) {
                  if (playerHere) {
                    line += playerHere.graphic;
                  } else if (monsterHere) {
                    line += monsterHere.graphic;
                  } else {
                    line += mapMarkers[map.world[i][j]];
                  }
                }
              }
              msg.push(line);
            }
            message.channel.send(msg, { split: true });
          }
          break;
        case 'look': {
          const map = JSON.parse(this._campaign.dungeon);
          message.channel.send(`> **${matchedChar.name}** looks around.`);

          const list = this.getSurroundings(
            map.world,
            new Vector2(matchedChar.position.x, matchedChar.position.y),
            3,
            message.author.id,
          );
          message.channel.send(`> **${matchedChar.name}** sees \`${this.formatListToString(list)}\`.`);
          break;
        }
        case 'examine':
          if (args[1]) {
            const map = JSON.parse(this._campaign.dungeon);
            const surroundings = await this.getSurroundings(map.world, matchedChar.position, 4, message.author.id);
            const nextArgs = args.splice(1).join(' ').toLowerCase();
            if (surroundings.find((obj) => obj.toLowerCase() === nextArgs)) {
              const allChar = this._campaign.characters;
              const allMons = this._campaign.monsters;
              const char = this.isPlayer(allChar, nextArgs);
              const mon = this.isMonster(allMons, nextArgs);
              if (char) {
                const examine = await this._databaseService.manager.findOne(Character, char);
                message.channel.send(`> **${matchedChar.name}** examines **${examine.name}**.`);
                const extraInfo = [];
                if (examine.power > matchedChar.defense) extraInfo.push('They look pretty powerful.');
                else if (examine.power === matchedChar.power) extraInfo.push('We look equally strong.');
                else extraInfo.push("They don't look very strong.");
                if (examine.defense > matchedChar.power) extraInfo.push('They look pretty defensive.');
                else if (examine.defense === matchedChar.defense) extraInfo.push('We look equally guarded.');
                else extraInfo.push("They don't look very shielded.");
                if (examine.current_health === examine.max_health) extraInfo.push('They look very healthy.');
                else extraInfo.push("It looks like the're wounded.");
                if (extraInfo.length > 1) message.channel.send(`> ${extraInfo.join(' ')}`);
              } else if (mon) {
                message.channel.send(`> That's a hostile **${mon.name}**!`);
              } else {
                switch (nextArgs) {
                  default:
                    message.channel.send(`> There doesn't seem anything to be here.`);
                    break;
                  case 'door':
                    message.channel.send(`> The door seems accessile.`);
                    break;
                  case 'start flag':
                    message.channel.send(`> That's the start flag, it is where we all started in this crazy place.`);
                    break;
                }
              }
            } else {
              message.channel.send(`> **${matchedChar.name}** stares blankly in front of them.`);
            }
          }
          break;
        case 'attack': {
          if (args[1]) {
            const map = JSON.parse(this._campaign.dungeon);
            const nextArgs = args.splice(1).join(' ');
            const allChar = this._campaign.characters;
            const allMon = this._campaign.monsters;
            const char = this.isPlayer(allChar, nextArgs);
            const mon = this.isMonster(allMon, nextArgs);
            let damage = 0;

            if (char) {
              damage = Math.max(0, matchedChar.power - char.defense);
              char.current_health -= damage;
              message.channel.send(`> **${matchedChar.name}** attacks **${nextArgs}** for ${damage} damage!`);
              if (char.current_health <= 0) {
                message.channel.send(`> **${char.name}** lets out a deathly scream and drops dead on the floor.`);
              }
              await this._databaseService.manager.save(char);
              break;
            } else if (mon) {
              if (
                this.isInRange(matchedChar.position, mon.position, 2) &&
                allMon.find((obj) => obj.name === nextArgs)
              ) {
                damage = Math.max(0, matchedChar.power - mon.defense);
                message.channel.send(`> **${matchedChar.name}** attacks **${mon.name}** for ${damage} damage!`);
                mon.current_health -= damage;
                if (mon.current_health <= 0) {
                  message.channel.send(
                    `> **${mon.name}** is defeated!\n> **${matchedChar.name}** gets ${mon.expvalue} EXP!`,
                  );
                  const matchedMonIndex = this._campaign.monsters.findIndex((m) => m.id === mon.id);
                  this._campaign.monsters.splice(matchedMonIndex, 1);
                  await this._databaseService.manager.save(this._campaign);
                  // TODO: add exp, level up, etc
                  break;
                }
              }
            }
            message.channel.send(`> **${matchedChar.name}** swings widely into the air, hitting nothing.`);
            await this.monsterTurn(message.channel, map, 2); // favor attack
          }
        }
      }
    }
  }

  formatListToString(list: string[]): string {
    const [sep, lastSep] = [`\`, \``, `\` and\``];
    return list.length > 2 ? list.slice(0, -1).join(sep) + lastSep + list[list.length - 1] : list.join(lastSep);
  }

  isPlayerHere(char: Character, vec: Vector2): boolean {
    if (char.position === vec) return true;
    return false;
  }

  isMonsterHere(mon: Monster, vec: Vector2): boolean {
    if (mon.position === vec) return true;
    return false;
  }

  isAnyPlayerHere(vec: Vector2): boolean {
    return this._campaign.characters.some((char) => char.current_health > 0 && this.isPlayerHere(char, vec));
  }

  isPlayer(chars: Character[], name: string): Character | null {
    return chars.find((char) => char.name === name);
  }

  isMonster(chars: Monster[], name: string): Monster | null {
    return chars.find((char) => char.name === name);
  }

  async monsterTurn(
    channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel,
    map: Map,
    favoredAction = 0,
  ): Promise<void> {
    this._campaign.monsters.forEach((monster) => {
      // TODO: monsters or other AI will take a turn here.
      // the AI should be capable of:
      // 1) damaging a player that is one tile next to them (non diagonal)
      // 2) moving one tile around if no player is near
      // if the AI has 0 zero health, it will be removed from the game
      const action = favoredAction && random.dice('d20') > 12 ? favoredAction : random.dice('d2');
      const charuid = this.isNearPlayers(this._campaign.characters, monster.position); // nearest player

      const matchedChar = this._campaign.characters.find((char) => char.uid === charuid);
      switch (action) {
        default:
          // nothing
          if (matchedChar) {
            channel.send(`> An eerie silence fills the room...`);
          } // if a monster moves near a player, they will know
          break;
        case 1: {
          // move
          const dir = random.dice('d4');
          const newPos = monster.position;
          let cardinal = '';
          switch (dir) {
            default:
              break;
            case 1: // up
              if (newPos.y - 1 >= 0 || map.world[newPos.y - 1][newPos.x] === 2) {
                newPos.y -= 1;
                cardinal = 'north';
              }
              break;
            case 2: // right;
              if (newPos.x + 1 <= map.width || map.world[newPos.y][newPos.x + 1] === 2) {
                newPos.x += 1;
                cardinal = 'east';
              }
              break;
            case 3: // down
              if (newPos.y + 1 <= map.height || map.world[newPos.y + 1][newPos.x] === 2) {
                newPos.y += 1;
                cardinal = 'south';
              }
              break;
            case 4: // left
              if (newPos.x - 1 >= 0 || map.world[newPos.y][newPos.x - 1] === 2) {
                newPos.x -= 1;
                cardinal = 'west';
              }
              break;
          }
          this.updateMonsterPos(map, newPos, monster);
          if (matchedChar) {
            channel.send(`> **${matchedChar.name}** sees **${monster.name}** going ${cardinal}!`); // if a monster moves near a player, they will know
          }
          break;
        }
        case 2: // attack
          if (matchedChar) {
            channel.send(`> **${matchedChar.name}** is hit by **${monster.name}**!`);
            matchedChar.current_health -= 1;
            if (matchedChar.current_health <= 0) {
              channel.send(`> **${matchedChar.name}** lets out a deathly scream, and drops dead to the floor...`);
              // const matchedCharIndex = this._campaign.characters.findIndex((chara) => chara.uid === char.uid);
              // this._campaign.characters.slice(matchedCharIndex, 1);
            }
          }
          break;
      }
    });
    await this._databaseService.manager.save(this._campaign);
  }

  updateMonsterPos(map: Map, newPos: Vector2, monster: Monster): void {
    if (
      newPos.y >= 0 &&
      newPos.y <= map.height &&
      newPos.x >= 0 &&
      newPos.x <= map.width &&
      map.world[newPos.y][newPos.x] !== 2
    ) {
      // now let's check if no players are here
      const anyPlayerhere = this.isAnyPlayerHere(newPos);
      if (!anyPlayerhere) {
        const updMonster = monster;
        updMonster.position = new Vector2(newPos.x, newPos.y);
        this._databaseService.manager.save(updMonster);
      }
    }
  }

  isNearPlayers(chars: Character[], vec: Vector2): string {
    let result = '';
    chars.forEach((char) => {
      if (char.current_health > 0) {
        if (this.isInRange(char.position, vec, 1)) {
          result = char.uid;
        }
      }
    });
    return result;
  }

  isNearPlayer(char: Character, vec: Vector2): string {
    let result = '';
    if (char.current_health > 0) {
      if (this.isInRange(char.position, vec, 1)) {
        result = char.uid;
      }
    }
    return result;
  }

  isInRange(myVec: Vector2, targetVec: Vector2, range: number): boolean {
    const dist = Math.sqrt((myVec.x - targetVec.x) ** 2 + (myVec.y - targetVec.y) ** 2);
    if (Math.abs(Math.floor(dist)) < range) {
      return true;
    }
    return false;
  }

  getSurroundings(world: [[]], vec: Vector2, range: number, uid: string): string[] {
    const result = [];
    const allChar = this._campaign.characters;
    const allMon = this._campaign.monsters;

    const playersInRange = allChar.filter(
      (char) =>
        char.uid !== uid &&
        this.isInRange(vec, new Vector2(char.position.x, char.position.y), range === -1 ? 999 : range),
    );
    playersInRange.forEach((index) => {
      result.push(`**${index.name}**`);
    });
    const monstersInRange = allMon.filter((mon) =>
      this.isInRange(vec, new Vector2(mon.position.x, mon.position.y), range === -1 ? 999 : range),
    );
    monstersInRange.forEach((index) => {
      result.push(`**${index.name} (Lv.${index.level})**`);
    });

    world.forEach((column, y) => {
      column.forEach((row, x) => {
        const diffX = Math.abs(row[x] - vec.x);
        const diffY = Math.abs(column[y] - vec.y);

        if ((diffX < range && diffY < range) || range === -1) {
          if (world[y][x] === 3 || world[y][x] === 4) result.push('**door**');
          if (world[y][x] === 5) result.push('**start flag**');
        }
      });
    });
    return result;
  }
}