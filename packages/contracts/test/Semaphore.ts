/* eslint-disable no-console */
/* eslint-disable no-plusplus */
/* eslint-disable arrow-body-style */

/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable jest/valid-expect */
import { Group, Identity, SemaphoreProof, generateProof } from "@semaphore-protocol/core"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { Signer, ZeroAddress } from "ethers"
import { run } from "hardhat"
// @ts-ignore
import { Semaphore } from "../typechain-types"

describe("Semaphore", () => {
    async function deploySemaphoreFixture() {
        const { semaphore } = await run("deploy", {
            logs: false
        })

        const semaphoreContract: Semaphore = semaphore

        const accounts = await run("accounts", { logs: false })
        const accountAddresses = await Promise.all(accounts.map((signer: Signer) => signer.getAddress()))

        const groupId = 0

        return {
            semaphoreContract,
            accounts,
            accountAddresses,
            groupId
        }
    }

    describe("# createGroup", () => {
        it("Should create a group", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const transaction = semaphoreContract.connect(accounts[1])["createGroup(address)"](accountAddresses[1])

            await expect(transaction).to.emit(semaphoreContract, "GroupCreated").withArgs(groupId)
            await expect(transaction)
                .to.emit(semaphoreContract, "GroupAdminUpdated")
                .withArgs(groupId, ZeroAddress, accountAddresses[1])
        })

        it("Should create a group with a custom Merkle tree root expiration", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const transaction = await semaphoreContract.connect(accounts[1])["createGroup(address,uint256)"](
                accountAddresses[0],
                5 // 5 seconds.
            )
            const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )

            await semaphoreContract.addMember(groupId, members[0])
            await semaphoreContract.addMember(groupId, members[1])
            await semaphoreContract.addMember(groupId, members[2])

            await expect(transaction).to.emit(semaphoreContract, "GroupCreated").withArgs(groupId)
            await expect(transaction)
                .to.emit(semaphoreContract, "GroupAdminUpdated")
                .withArgs(groupId, ZeroAddress, accountAddresses[0])
        })

        it("Should create a group without any parameters", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const transaction = await semaphoreContract["createGroup()"]()

            await expect(transaction).to.emit(semaphoreContract, "GroupCreated").withArgs(groupId)
            await expect(transaction)
                .to.emit(semaphoreContract, "GroupAdminUpdated")
                .withArgs(groupId, ZeroAddress, accountAddresses[0])
        })
    })

    describe("# updateGroupMerkleTreeDuration", () => {
        it("Should not update a group Merkle tree duration if the caller is not the group admin", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[1])

            const transaction = semaphoreContract.updateGroupMerkleTreeDuration(groupId, 300)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should update the group Merkle tree duration", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.updateGroupMerkleTreeDuration(groupId, 300)

            await expect(transaction)
                .to.emit(semaphoreContract, "GroupMerkleTreeDurationUpdated")
                .withArgs(groupId, 3600, 300)
        })
    })

    describe("# updateGroupAdmin", () => {
        it("Should not update an admin if the caller is not the admin", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[1])

            const transaction = semaphoreContract.updateGroupAdmin(groupId, accountAddresses[0])

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should update the admin", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.updateGroupAdmin(groupId, accountAddresses[1])

            await expect(transaction)
                .to.emit(semaphoreContract, "GroupAdminPending")
                .withArgs(groupId, accountAddresses[0], accountAddresses[1])
        })

        it("Should not accept accept the new admin if the caller is not the new admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.updateGroupAdmin(groupId, accountAddresses[1])

            const transaction = semaphoreContract.connect(accounts[2]).acceptGroupAdmin(groupId)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotThePendingGroupAdmin"
            )
        })

        it("Should accept the new admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.updateGroupAdmin(groupId, accountAddresses[1])

            const transaction = semaphoreContract.connect(accounts[1]).acceptGroupAdmin(groupId)

            await expect(transaction)
                .to.emit(semaphoreContract, "GroupAdminUpdated")
                .withArgs(groupId, accountAddresses[0], accountAddresses[1])
        })
    })

    describe("# addMember", () => {
        it("Should not add a member if the caller is not the group admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const member = 2n

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.connect(accounts[1]).addMember(groupId, member)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should add a new member in an existing group", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const group = new Group()
            const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )

            group.addMember(members[0])

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.addMember(groupId, members[0])

            await expect(transaction)
                .to.emit(semaphoreContract, "MemberAdded")
                .withArgs(groupId, 0, members[0], group.root)
        })
    })

    describe("# addMembers", () => {
        it("Should not add members if the caller is not the group admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const members = [1n, 2n, 3n]

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.connect(accounts[1]).addMembers(groupId, members)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should add new members to an existing group", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const members = [1n, 2n, 3n]
            const group = new Group()

            group.addMembers(members)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.addMembers(groupId, members)

            await expect(transaction)
                .to.emit(semaphoreContract, "MembersAdded")
                .withArgs(groupId, 0, members, group.root)
        })
    })

    describe("# updateMember", () => {
        it("Should not update a member if the caller is not the group admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const member = 2n

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.connect(accounts[1]).updateMember(groupId, member, 1, [0, 1])

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should update a member from an existing group", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const members = [1n, 2n, 3n]
            const group = new Group()

            group.addMembers(members)

            group.updateMember(0, 4n)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.addMembers(groupId, members)

            const { siblings, root } = group.generateMerkleProof(0)

            const transaction = semaphoreContract.updateMember(groupId, 1n, 4n, siblings)

            await expect(transaction).to.emit(semaphoreContract, "MemberUpdated").withArgs(groupId, 0, 1n, 4n, root)
        })
    })

    describe("# removeMember", () => {
        it("Should not remove a member if the caller is not the group admin", async () => {
            const { semaphoreContract, accounts, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const member = 2n

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const transaction = semaphoreContract.connect(accounts[1]).removeMember(groupId, member, [0, 1])

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__CallerIsNotTheGroupAdmin"
            )
        })

        it("Should remove a member from an existing group", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const members = [1n, 2n, 3n]
            const group = new Group()

            group.addMembers(members)

            group.removeMember(2)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.addMembers(groupId, members)

            const { siblings, root } = group.generateMerkleProof(2)

            const transaction = semaphoreContract.removeMember(groupId, 3n, siblings)

            await expect(transaction).to.emit(semaphoreContract, "MemberRemoved").withArgs(groupId, 2, 3n, root)
        })
    })

    describe("# getGroupAdmin", () => {
        it("Should return a 0 address if the group does not exist", async () => {
            const { semaphoreContract } = await loadFixture(deploySemaphoreFixture)

            const address = await semaphoreContract.getGroupAdmin(999)

            expect(address).to.equal(ZeroAddress)
        })

        it("Should return the address of the group admin", async () => {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const address = await semaphoreContract.getGroupAdmin(groupId)

            expect(address).to.equal(accountAddresses[0])
        })
    })

    describe("# verifyProof", () => {
        async function deployVerifyProofFixture() {
            const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

            const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )

            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.addMembers(groupId, members)

            const identity = new Identity("0")
            const group = new Group()

            group.addMembers(members)

            const merkleTreeDepth = 12
            const message = 2
            const proof: SemaphoreProof = await generateProof(identity, group, message, group.root, merkleTreeDepth)

            return {
                semaphoreContract,
                accountAddresses,
                groupId,
                members,
                proof
            }
        }

        it("Should not verify a proof if the group does not exist", async () => {
            const { semaphoreContract, proof } = await loadFixture(deployVerifyProofFixture)

            const transaction = semaphoreContract.verifyProof(11, proof)

            await expect(transaction).to.be.revertedWithCustomError(semaphoreContract, "Semaphore__GroupDoesNotExist")
        })

        it("Should not verify a proof if the Merkle tree root is not part of the group", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployVerifyProofFixture)

            const transaction = semaphoreContract.verifyProof(groupId, { ...proof, merkleTreeRoot: 1 })

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__MerkleTreeRootIsNotPartOfTheGroup"
            )
        })

        it("Should verify a proof for an onchain group", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployVerifyProofFixture)

            const validProof = await semaphoreContract.verifyProof(groupId, proof)

            expect(validProof).to.equal(true)
        })

        it("Should not verify a proof if the Merkle tree root is expired", async () => {
            const { semaphoreContract, accountAddresses, members } = await loadFixture(deployVerifyProofFixture)

            // create new group with 0s Merkle tree root expiration
            const groupId = 1
            await semaphoreContract["createGroup(address,uint256)"](accountAddresses[0], 0)
            await semaphoreContract.addMember(groupId, members[0])
            await semaphoreContract.addMember(groupId, members[1])
            await semaphoreContract.addMember(groupId, members[2])

            const message = 2
            const merkleTreeDepth = 12
            const identity = new Identity("0")
            const group = new Group()

            group.addMembers([members[0], members[1]])

            const proof = await generateProof(identity, group, message, group.root, merkleTreeDepth)
            const transaction = semaphoreContract.verifyProof(groupId, proof)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__MerkleTreeRootIsExpired"
            )
        })

        it("Should not verify a proof if the Merkle depth is not supported", async () => {
            const { semaphoreContract, groupId, members } = await loadFixture(deployVerifyProofFixture)

            const message = 2
            const merkleTreeDepth = 12
            const identity = new Identity("0")
            const group = new Group()

            group.addMembers(members)

            const scope = "random-scope"
            const proof = await generateProof(identity, group, message, scope, merkleTreeDepth)

            proof.merkleTreeDepth = 33

            const transaction = semaphoreContract.verifyProof(groupId, proof)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__MerkleTreeDepthIsNotSupported"
            )
        })

        it("Should not verify a proof if the group has no members", async () => {
            const { semaphoreContract, accountAddresses, proof } = await loadFixture(deployVerifyProofFixture)

            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const groupId = 1
            const transaction = semaphoreContract.verifyProof(groupId, proof)

            await expect(transaction).to.be.revertedWithCustomError(semaphoreContract, "Semaphore__GroupHasNoMembers")
        })
    })

    describe("# validateProof", () => {
        async function deployValidateProofFixture() {
            const { semaphoreContract, accountAddresses } = await loadFixture(deploySemaphoreFixture)

            const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )
            const merkleTreeDepth = 12
            const message = 2

            // groupId = 0
            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.addMembers(0, [members[1], members[2]])

            // groupId = 1
            const groupId = 1
            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await semaphoreContract.addMember(groupId, members[0])
            await semaphoreContract.addMember(groupId, members[1])

            const identity = new Identity("0")
            const group = new Group()

            group.addMember(members[0])

            const proof = await generateProof(identity, group, message, group.root, merkleTreeDepth)

            return { semaphoreContract, groupId, proof, accountAddresses }
        }

        it("Should insert members,remove member,update member and verifyProof", async () => {
            const { semaphoreContract, accountAddresses } = await loadFixture(deployValidateProofFixture)

            const identity = new Identity("0")
            const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )
            const group = new Group(members)

            // Create a group and add 3 members.
            await semaphoreContract["createGroup(address)"](accountAddresses[0])

            const groupId = 2

            // Adding members to group

            await semaphoreContract.addMembers(groupId, members)

            // Remove the third member.
            {
                group.removeMember(2)
                const { siblings } = group.generateMerkleProof(2)

                await semaphoreContract.removeMember(groupId, members[2], siblings)
            }

            // Update the second member.
            {
                group.updateMember(1, members[2])
                const { siblings } = group.generateMerkleProof(1)

                await semaphoreContract.updateMember(groupId, members[1], members[2], siblings)
            }

            // Validate a proof.

            const proof = await generateProof(identity, group, 42, group.root)

            const transaction = await semaphoreContract.validateProof(groupId, proof)

            await expect(transaction)
                .to.emit(semaphoreContract, "ProofValidated")
                .withArgs(
                    groupId,
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    proof.message,
                    proof.merkleTreeRoot,
                    proof.points
                )
        })

        it("Should throw an exception if the proof is not valid", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployValidateProofFixture)

            const transaction = semaphoreContract.validateProof(groupId, { ...proof, scope: 0 })

            await expect(transaction).to.be.revertedWithCustomError(semaphoreContract, "Semaphore__InvalidProof")
        })

        it("Should validate a proof for an onchain group with one member correctly", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployValidateProofFixture)

            const transaction = semaphoreContract.validateProof(groupId, proof)

            await expect(transaction)
                .to.emit(semaphoreContract, "ProofValidated")
                .withArgs(
                    groupId,
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    proof.message,
                    proof.merkleTreeRoot,
                    proof.points
                )
        })

        it("Should validate a proof for an onchain group with more than one member correctly", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployValidateProofFixture)

            const transaction = semaphoreContract.validateProof(groupId, proof)

            await expect(transaction)
                .to.emit(semaphoreContract, "ProofValidated")
                .withArgs(
                    groupId,
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    proof.message,
                    proof.merkleTreeRoot,
                    proof.points
                )
        })

        it("Should not validate the same proof for an onchain group twice", async () => {
            const { semaphoreContract, groupId, proof } = await loadFixture(deployValidateProofFixture)

            await semaphoreContract.validateProof(groupId, proof)

            const transaction = semaphoreContract.validateProof(groupId, proof)

            await expect(transaction).to.be.revertedWithCustomError(
                semaphoreContract,
                "Semaphore__YouAreUsingTheSameNullifierTwice"
            )
        })

        /**
         * This demonstrates a critical issue with member updates and tree roots:
         * When working with a group whose size is not a power of 2, updating a member and then
         * adding new members can cause the Merkle roots to diverge between an in-memory tree
         * and the on-chain tree, effectively freezing out updates, removals and member generated
         * inclusion proofs since a valid merkle proof cannot be generated.
         *
         * This is triggered by the sideNodes array not being updated in the _update function
         * so an incorrect value is used when computing parent nodes.
         *
         * This test will only pass once the InternalLeanIMT.sol _update logic is fixed.
         *
         * yarn test test/Semaphore.ts --grep "Should insert members, update member, insert more members and verify merkle roots"
         */
        it("Should insert members, update member, insert more members and verify merkle roots", async () => {
            const { semaphoreContract, accountAddresses } = await loadFixture(deployValidateProofFixture)

            // Create initial members
            // Using a value 2^n will pass the test, all other group sizes will fail
            const memberCount = 77
            const members = Array.from({ length: memberCount }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )
            const group = new Group()

            // Create group
            await semaphoreContract["createGroup(address)"](accountAddresses[0])
            const groupId = 2

            // Add members one by one
            for (const member of members) {
                await semaphoreContract.addMember(groupId, member)
                group.addMember(member)
            }

            // Verify roots match after adding initial members
            const contractRoot1 = await semaphoreContract.getMerkleTreeRoot(groupId)
            // This will always pass
            expect(contractRoot1).to.equal(group.root)

            // Create new identity and get siblings for index 1 update
            const identityIndex = 28
            const newIdentity = new Identity("new")
            const { siblings } = group.generateMerkleProof(identityIndex)

            // Update member in both groups
            group.updateMember(identityIndex, newIdentity.commitment)
            await semaphoreContract.updateMember(groupId, members[identityIndex], newIdentity.commitment, siblings)

            // Verify roots match after update
            const contractRoot2 = await semaphoreContract.getMerkleTreeRoot(groupId)
            // This will always pass
            expect(contractRoot2).to.equal(group.root)

            // Add one more member to both groups
            const finalIdentity = new Identity("final")
            group.addMember(finalIdentity.commitment)
            await semaphoreContract.addMember(groupId, finalIdentity.commitment)

            // Verify roots match after final addition
            const contractRoot3 = await semaphoreContract.getMerkleTreeRoot(groupId)
            // This is the assertion that will fail with a non 2^n group size
            expect(contractRoot3).to.equal(group.root)
        })

        /**
         * Tests Semaphore group operations with random group sizes and mixed operations.
         * Creates a group with random number of members (3-100), adds them using both
         * single and batch insertions, then performs random updates. Verifies merkle
         * roots match between contract and local group after each operation. Finally,
         * adds a random batch of members and verifies the roots match.
         *
         * This test will only pass once the InternalLeanIMT.sol _update logic is fixed.
         *
         * yarn test test/Semaphore.ts --grep "Should handle random group sizes with multiple random updates and insertions"
         */
        it("Should handle random group sizes with multiple random updates and insertions", async () => {
            const { semaphoreContract, accountAddresses } = await loadFixture(deploySemaphoreFixture)

            // Create initial members (random size between 3 and 100)
            const memberCount = Math.floor(Math.random() * 98) + 3
            const members = Array.from({ length: memberCount }, (_, i) => new Identity(i.toString())).map(
                ({ commitment }) => commitment
            )
            const group = new Group()

            // Create group and get groupId from counter
            const tx = await semaphoreContract["createGroup(address)"](accountAddresses[0])
            await tx.wait()
            const groupId = (await semaphoreContract.groupCounter()) - 1n // Note: using BigInt subtraction

            // Add initial members (randomly choosing between single and batch insertion)
            let currentIndex = 0
            while (currentIndex < members.length) {
                const shouldBatch = Math.random() > 0.5
                if (shouldBatch) {
                    const batchSize = Math.min(Math.floor(Math.random() * 10) + 1, members.length - currentIndex)
                    const batch = members.slice(currentIndex, currentIndex + batchSize)
                    await semaphoreContract.addMembers(groupId, batch)
                    batch.forEach((member) => group.addMember(member))
                    currentIndex += batchSize
                } else {
                    await semaphoreContract.addMember(groupId, members[currentIndex])
                    group.addMember(members[currentIndex])
                    currentIndex++
                }
            }

            // Verify roots match after initial insertions
            const contractRoot1 = await semaphoreContract.getMerkleTreeRoot(groupId)
            expect(contractRoot1).to.equal(group.root)

            // Perform random number of updates (between 1 and 20)
            const updateCount = Math.floor(Math.random() * 20) + 1
            for (let i = 0; i < updateCount; i++) {
                const updateIndex = Math.floor(Math.random() * members.length)
                const newIdentity = new Identity(`new-${i}`)
                const { siblings } = group.generateMerkleProof(updateIndex)

                // Update member in both groups
                group.updateMember(updateIndex, newIdentity.commitment)
                await semaphoreContract.updateMember(groupId, members[updateIndex], newIdentity.commitment, siblings)
                members[updateIndex] = newIdentity.commitment

                // Verify roots match after each update
                const contractRoot = await semaphoreContract.getMerkleTreeRoot(groupId)
                expect(contractRoot).to.equal(group.root)
            }

            // Add final random batch of members (between 1 and 10)
            const finalMemberCount = Math.floor(Math.random() * 10) + 1
            const finalMembers = Array.from({ length: finalMemberCount }, (_, i) => {
                return new Identity(`final-${i}`).commitment
            })

            // Randomly choose between single and batch insertion for final members
            currentIndex = 0
            while (currentIndex < finalMembers.length) {
                const shouldBatch = Math.random() > 0.5
                if (shouldBatch) {
                    const batchSize = Math.min(Math.floor(Math.random() * 5) + 1, finalMembers.length - currentIndex)
                    const batch = finalMembers.slice(currentIndex, currentIndex + batchSize)
                    await semaphoreContract.addMembers(groupId, batch)
                    batch.forEach((member) => group.addMember(member))
                    currentIndex += batchSize
                } else {
                    await semaphoreContract.addMember(groupId, finalMembers[currentIndex])
                    group.addMember(finalMembers[currentIndex])
                    currentIndex++
                }
            }

            // Verify final roots match
            const contractRoot3 = await semaphoreContract.getMerkleTreeRoot(groupId)
            expect(contractRoot3).to.equal(group.root)
        })
    })

    describe("SemaphoreGroups", () => {
        describe("# hasMember", () => {
            it("Should return true because the member is part of the group", async () => {
                const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

                const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                    ({ commitment }) => commitment
                )

                await semaphoreContract["createGroup(address)"](accountAddresses[0])
                await semaphoreContract.addMember(groupId, members[0])

                const isMember = await semaphoreContract.hasMember(groupId, members[0])

                await expect(isMember).to.be.true
            })

            it("Should return false because the member is not part of the group", async () => {
                const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

                await semaphoreContract["createGroup(address)"](accountAddresses[0])

                const identity = new Identity()
                const isMember = await semaphoreContract.hasMember(groupId, identity.commitment)

                await expect(isMember).to.be.false
            })
        })

        describe("# indexOf", () => {
            it("Should return the index of a member", async () => {
                const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

                const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                    ({ commitment }) => commitment
                )

                await semaphoreContract["createGroup(address)"](accountAddresses[0])
                await semaphoreContract.addMember(groupId, members[0])

                const index = await semaphoreContract.indexOf(groupId, members[0])

                await expect(index).to.equal(0)
            })
        })

        describe("# getMerkleTreeDepth", () => {
            it("Should return the merkle tree depth", async () => {
                const { semaphoreContract, accountAddresses, groupId } = await loadFixture(deploySemaphoreFixture)

                const members = Array.from({ length: 3 }, (_, i) => new Identity(i.toString())).map(
                    ({ commitment }) => commitment
                )

                await semaphoreContract["createGroup(address)"](accountAddresses[0])
                await semaphoreContract.addMember(groupId, members[0])
                await semaphoreContract.addMember(groupId, members[1])
                await semaphoreContract.addMember(groupId, members[2])

                const depth = await semaphoreContract.getMerkleTreeDepth(groupId)

                await expect(depth).to.equal(2)
            })
        })
    })
})
