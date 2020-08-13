import Discord, { Collection } from 'discord.js';

import MongoService from '../../core/services/mongo.service';

import ICommand from './ICommand';

const command: ICommand = {
  name: 'addgreeting',
  aliases: ['ag'],
  description: 'Adds a string to the list greetings used when new users connect to server!',
  async execute(message: Discord.Message, args: string[], prefix?: string, commands?: Collection<string, ICommand>, dbService?: MongoService) {
    let isPermitted = false;
    const permittedRoles = ['bot-devs', 'admin', 'staff']

    message.guild.roles.cache.forEach(r => {
      if (permittedRoles.indexOf(r.name) !== -1) {
        isPermitted = true;
      }
    })

    // Only certain users can use this command
    // TODO: Better handling of permissions for commands in a generic way
    if (!isPermitted) {
      return message.reply('Sorry but I can\'t let you add greetings!');
    }

    // Can't do much without a message
    if (args.length === 0) {
      return message.author.send('When adding a greeting you need to also provide a message!');
    }

    // Check for dupes
    const greetingStr = args.join(' ');
    const matchedMessages = await dbService.find(message.author.id, 'greetings', { message: greetingStr });
    if (matchedMessages.length > 0) {
      return message.author.send('That greeting has already been added!');
    }

    const result = await dbService.insert(message.author.id, 'greetings', [{ message: greetingStr }]);

    if (!result) {
      message.author.send('Uh-oh! Couldn\'t add that greeting!');
    }

    message.author.send('I\'ve added the greeting you told me about!');
  },
};

export default command;