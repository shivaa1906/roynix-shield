import {
    ActionRowBuilder,
    Events,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    MessageFlags
} from "discord.js";
import emojis from "../../config/emojis.js";

export const data = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction, client) {
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
        if(!interaction.customId.startsWith('vc_')) return;

        const handleResponse = async (content, ephemeral = true) => {
            try {
                if (interaction.replied || interaction.deferred) {
                    return await interaction.editReply({ content });
                }
                return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
            } catch (error) {
                console.error('Response Error:', error);
            }
        };

        const getActiveVC = async (member, id) => {
            try {
                const channel = member.voice?.channel;
                if (!channel) return { error: `${emojis.warn} You must be in a voice channel!` };

                const activeVc = await client.activeVcDB.get(channel.id);
                if (!activeVc) return { error: `${emojis.warn} This is not an active voice channel!` };
                if (id !== 'vc_claim' && activeVc.ownerId !== member.id) return { error: `${emojis.warn} You must be the owner of this VC!` };

                const vc = interaction.guild.channels.cache.get(activeVc.channelId) ||
                    await interaction.guild.channels.fetch(activeVc.channelId).catch(() => null);
                if (!vc) return { error: `${emojis.warn} Voice channel not found!` };

                return { activeVc, vc };
            } catch (error) {
                return { error: `${emojis.cross} Error fetching VC data!` };
            }
        };

        const resolveMember = async (query) => {
            try {
                const byId = await interaction.guild.members.fetch({ user: query.trim(), force: true });
                if (byId) return byId;
            } catch {
                const members = await interaction.guild.members.fetch({ query: query.trim(), limit: 1 });
                return members.first();
            }
        };

        const isBanned = (vc, userId) => {
            const overwrites = vc.permissionOverwrites.cache.get(userId);
            return overwrites?.deny.has(PermissionFlagsBits.Connect);
        };

        try {
            if (interaction.isModalSubmit()) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const vcResult = await getActiveVC(interaction.member);
                if (vcResult.error) return handleResponse(vcResult.error);
                const { vc, activeVc } = vcResult;

                switch (interaction.customId) {
                    case 'vc_rename_modal': {
                        const newName = interaction.fields.getTextInputValue('new_name');
                        if (!newName || newName.length > 32) {
                            return handleResponse(`${emojis.warn} Invalid name! (1-32 characters)`);
                        }
                        await vc.setName(newName);
                        return handleResponse(`${emojis.tick} Renamed to: ${newName}`);
                    }

                    case 'vc_ban_modal': {
                        const userInput = interaction.fields.getTextInputValue('user_input');
                        const targetMember = await resolveMember(userInput);

                        if (!targetMember) return handleResponse(`${emojis.warn} User not found!`);
                        if (targetMember.id === interaction.user.id) return handleResponse(`${emojis.warn} You cannot ban yourself!`);
                        if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                            return handleResponse(`${emojis.warn} Cannot ban administrators!`);
                        }
                        if (isBanned(vc, targetMember.id)) {
                            return handleResponse(`${emojis.warn} User is already banned!`);
                        }
                        if (!vc.members.has(targetMember.id)) {
                            return handleResponse(`${emojis.warn} User not in VC!`);
                        }

                        await vc.permissionOverwrites.create(targetMember.id, {
                            Connect: false,
                            ViewChannel: false
                        });

                        targetMember.voice.disconnect().catch(() => null);
                        return handleResponse(`${emojis.tick} Banned ${targetMember}!`);
                    }

                    case 'vc_unban_modal': {
                        const userInput = interaction.fields.getTextInputValue('user_input');
                        const targetMember = await resolveMember(userInput);

                        if (!targetMember) return handleResponse(`${emojis.warn} User not found!`);
                        if (targetMember.id === interaction.user.id) return handleResponse(`${emojis.warn} You cannot unban yourself!`);
                        if (!isBanned(vc, targetMember.id)) {
                            return handleResponse(`${emojis.warn} User is not banned!`);
                        }

                        await vc.permissionOverwrites.delete(targetMember.id);
                        return handleResponse(`${emojis.tick} Unbanned ${targetMember}!`);
                    }

                    case 'vc_kick_modal': {
                        const userInput = interaction.fields.getTextInputValue('user_input');
                        const targetMember = await resolveMember(userInput);

                        if (!targetMember) return handleResponse(`${emojis.warn} User not found!`);
                        if (targetMember.id === interaction.user.id) return handleResponse(`${emojis.warn} You cannot kick yourself!`);
                        if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
                            return handleResponse(`${emojis.warn} Cannot kick administrators!`);
                        }
                        if (!vc.members.has(targetMember.id)) {
                            return handleResponse(`${emojis.warn} User not in VC!`);
                        }

                        await targetMember.voice.disconnect();
                        return handleResponse(`${emojis.tick} Kicked ${targetMember}!`);
                    }

                    case 'vc_transfer_modal': {
                        const userInput = interaction.fields.getTextInputValue('user_input');
                        const targetMember = await resolveMember(userInput);

                        if (!targetMember) return handleResponse(`${emojis.warn} User not found!`);
                        if (targetMember.id === interaction.user.id) return handleResponse(`${emojis.warn} Cannot transfer to yourself!`);
                        if (!vc.members.has(targetMember.id)) {
                            return handleResponse(`${emojis.warn} User must be in the VC!`);
                        }

                        await client.activeVcDB.set(vc.id, {
                            ...activeVc,
                            ownerId: targetMember.id
                        });
                        return handleResponse(`${emojis.tick} Ownership transferred to ${targetMember}!`);
                    }

                    case 'vc_limit_modal': {
                        const limitInput = interaction.fields.getTextInputValue('limit_input');
                        const userLimit = parseInt(limitInput);
                        
                        if (isNaN(userLimit)) return handleResponse(`${emojis.warn} Please enter a valid number!`);
                        
                        let finalLimit = userLimit === 0 ? 99 : Math.min(Math.max(userLimit, 0), 99);
                        
                        await vc.setUserLimit(finalLimit);
                        return handleResponse(`${emojis.tick} User limit set to ${finalLimit === 99 ? 'unlimited' : finalLimit}!`);
                    }

                    case 'vc_bitrate_modal': {
                        const bitrateInput = interaction.fields.getTextInputValue('bitrate_input');
                        const bitrate = parseInt(bitrateInput);
                        
                        if (isNaN(bitrate)) return handleResponse(`${emojis.warn} Please enter a valid number!`);
                        
                        const maxBitrate = interaction.guild.premiumTier === 'TIER_3' ? 384000 :
                                          interaction.guild.premiumTier === 'TIER_2' ? 256000 :
                                          interaction.guild.premiumTier === 'TIER_1' ? 128000 : 96000;
                        
                        const finalBitrate = Math.min(Math.max(bitrate * 1000, 8000), maxBitrate);
                        
                        await vc.setBitrate(finalBitrate);
                        return handleResponse(`${emojis.tick} Bitrate set to ${finalBitrate / 1000}kbps!`);
                    }
                }
            }

            if (interaction.isButton()) {
                const vcResult = await getActiveVC(interaction.member, interaction.customId);
                if (vcResult.error) return handleResponse(vcResult.error);
                const { vc, activeVc } = vcResult;

                switch (interaction.customId) {
                    case 'vc_lock':
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
                        return handleResponse(`${emojis.tick} VC locked!`);

                    case 'vc_unlock':
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await vc.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
                        return handleResponse(`${emojis.tick} VC unlocked!`);

                    case 'vc_hide':
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                        return handleResponse(`${emojis.tick} VC hidden!`);

                    case 'vc_unhide':
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await vc.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
                        return handleResponse(`${emojis.tick} VC visible!`);

                    case 'vc_claim': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        if (activeVc.ownerId === interaction.user.id) {
                            return handleResponse(`${emojis.warn} You already own this vc`);
                        }
                        if (vc.members.has(activeVc.ownerId)) {
                            return handleResponse(`${emojis.warn} The owner is still present in the vc`);
                        }
                        await client.activeVcDB.set(vc.id, {
                            ...activeVc,
                            ownerId: interaction.user.id
                        });
                        return handleResponse(`${emojis.tick} Ownership claimed!`);
                    }

                    case 'vc_rename': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_rename_modal')
                            .setTitle('Rename Voice Channel')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('new_name')
                                        .setLabel('New Channel Name')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true)
                                        .setMaxLength(32)
                                )
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_ban': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_ban_modal')
                            .setTitle('Ban User from VC')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('user_input')
                                        .setLabel('User ID or Username')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true)
                                )
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_unban': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_unban_modal')
                            .setTitle('Unban User from VC')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('user_input')
                                        .setLabel('User ID or Username')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true))
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_kick': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_kick_modal')
                            .setTitle('Kick User from VC')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('user_input')
                                        .setLabel('User ID or Username')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true))
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_transfer': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_transfer_modal')
                            .setTitle('Transfer VC Ownership')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('user_input')
                                        .setLabel('New Owner ID/Username')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true))
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_region': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        const regions = [
                            { label: 'Automatic', value: 'auto' },
                            { label: 'Brazil', value: 'brazil' },
                            { label: 'Europe', value: 'europe' },
                            { label: 'Hong Kong', value: 'hongkong' },
                            { label: 'India', value: 'india' },
                            { label: 'Japan', value: 'japan' },
                            { label: 'Russia', value: 'russia' },
                            { label: 'Singapore', value: 'singapore' },
                            { label: 'South Africa', value: 'southafrica' },
                            { label: 'Sydney', value: 'sydney' },
                            { label: 'US Central', value: 'us-central' },
                            { label: 'US East', value: 'us-east' },
                            { label: 'US South', value: 'us-south' },
                            { label: 'US West', value: 'us-west' }
                        ];

                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId('vc_region_select')
                            .setPlaceholder('Select VC Region')
                            .addOptions(regions);

                        const row = new ActionRowBuilder().addComponents(selectMenu);
                        return interaction.editReply({
                            content: `Select a region:`,
                            components: [row]
                        });
                    }

                    case 'vc_limit': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_limit_modal')
                            .setTitle('Set User Limit')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('limit_input')
                                        .setLabel('User Limit (0 = unlimited)')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true)
                                        .setPlaceholder('Enter number between 0-99')
                                        .setMaxLength(2)
                                )
                            );
                        return interaction.showModal(modal);
                    }

                    case 'vc_bitrate': {
                        const modal = new ModalBuilder()
                            .setCustomId('vc_bitrate_modal')
                            .setTitle('Set Bitrate')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('bitrate_input')
                                        .setLabel('Bitrate in kbps')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(true)
                                        .setPlaceholder(`8-${interaction.guild.maximumBitrate / 1000}kbps`)
                                        .setMaxLength(4)
                                )
                            );
                        return interaction.showModal(modal);
                    }

                    default:
                        return handleResponse(`${emojis.warn} Unknown action!`);
                }
            }

            if (interaction.isStringSelectMenu()) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const vcResult = await getActiveVC(interaction.member);
                if (vcResult.error) return handleResponse(vcResult.error);
                const { vc } = vcResult;

                switch (interaction.customId) {
                    case 'vc_region_select': {
                        const region = interaction.values[0];
                        const validRegions = [
                            'auto', 'brazil', 'europe', 'hongkong', 'india', 'japan',
                            'russia', 'singapore', 'southafrica', 'sydney',
                            'us-central', 'us-east', 'us-south', 'us-west'
                        ];

                        if (!validRegions.includes(region)) {
                            return handleResponse(`${emojis.warn} Invalid region selected!`);
                        }

                        try {
                            await vc.setRTCRegion(region);
                            return handleResponse(`${emojis.tick} Region updated to: ${region.toUpperCase()}`);
                        } catch (error) {
                            return handleResponse(`${emojis.cross} Failed to set region: ${error.message}`);
                        }
                    }

                    default:
                        return handleResponse(`${emojis.warn} Unknown selection!`);
                }
            }
        } catch (error) {
            console.error('VC Control Error:', error);
            return handleResponse(`${emojis.cross} Critical error: ${error.message}`);
        }
    }
}; 